use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

use raphael_sim::Action;
use raphael_sim::ActionMask;
use raphael_sim::Condition;
use raphael_sim::Settings;
use raphael_sim::SimulationState;
use raphael_solver::AtomicFlag;
use raphael_solver::MacroSolver;
use raphael_solver::SolverSettings;

#[wasm_bindgen]
pub fn init_threads(num_threads: usize) -> js_sys::Promise {
    console_error_panic_hook::set_once();
    wasm_bindgen_rayon::init_thread_pool(num_threads)
}

#[derive(Deserialize)]
struct SolveConfig {
    max_cp: u16,
    max_durability: u16,
    max_progress: u16,
    max_quality: u16,
    base_progress: u16,
    base_quality: u16,
    job_level: u8,
    use_manipulation: bool,
    use_heart_and_soul: bool,
    use_quick_innovation: bool,
    use_trained_eye: bool,
    backload_progress: bool,
    adversarial: bool,
    #[serde(default = "default_true")]
    allow_non_max_quality_solutions: bool,
    /// When set, the solver halts as soon as an intermediate solution reaches
    /// this quality value. Used for batch HQ runs that don't need the
    /// globally-optimal step/duration tiebreak — first sufficient solution wins.
    /// Defaults to None (full search, current behaviour).
    #[serde(default)]
    quality_threshold: Option<u16>,
}

fn default_true() -> bool { true }

#[derive(Serialize)]
struct SolveResult {
    actions: Vec<String>,
    runtime_stats: RuntimeStats,
}

/// Telemetry projection of `raphael_solver::MacroSolverStats` into a JS-serialisable shape.
/// Lives in the wrapper because upstream stats structs do not derive `serde::Serialize`.
#[derive(Serialize, Default)]
struct RuntimeStats {
    search_inserted_nodes: usize,
    search_processed_nodes: usize,
    finish_states: usize,
    finish_values: usize,
    quality_ub_states_main: usize,
    quality_ub_states_shards: usize,
    quality_ub_values: usize,
    step_lb_states_main: usize,
    step_lb_states_shards: usize,
    step_lb_values: usize,
}

fn build_settings(config: &SolveConfig) -> Settings {
    let mut allowed_actions = ActionMask::all();

    if !config.use_manipulation {
        allowed_actions = allowed_actions.remove(Action::Manipulation);
    }
    if !config.use_heart_and_soul {
        allowed_actions = allowed_actions.remove(Action::HeartAndSoul);
    }
    if !config.use_quick_innovation {
        allowed_actions = allowed_actions.remove(Action::QuickInnovation);
    }
    if !config.use_trained_eye {
        allowed_actions = allowed_actions.remove(Action::TrainedEye);
    }

    Settings {
        max_cp: config.max_cp,
        max_durability: config.max_durability,
        max_progress: config.max_progress,
        max_quality: config.max_quality,
        base_progress: config.base_progress,
        base_quality: config.base_quality,
        job_level: config.job_level,
        allowed_actions,
        adversarial: config.adversarial,
        backload_progress: config.backload_progress,
        stellar_steady_hand_charges: 0,
    }
}

fn parse_action(name: &str) -> Result<Action, String> {
    match name {
        "BasicSynthesis" => Ok(Action::BasicSynthesis),
        "BasicTouch" => Ok(Action::BasicTouch),
        "MasterMend" | "MastersMend" => Ok(Action::MasterMend),
        "Observe" => Ok(Action::Observe),
        "TricksOfTheTrade" => Ok(Action::TricksOfTheTrade),
        "WasteNot" => Ok(Action::WasteNot),
        "Veneration" => Ok(Action::Veneration),
        "StandardTouch" => Ok(Action::StandardTouch),
        "GreatStrides" => Ok(Action::GreatStrides),
        "Innovation" => Ok(Action::Innovation),
        "WasteNot2" | "WasteNotII" => Ok(Action::WasteNot2),
        "ByregotsBlessing" => Ok(Action::ByregotsBlessing),
        "PreciseTouch" => Ok(Action::PreciseTouch),
        "MuscleMemory" => Ok(Action::MuscleMemory),
        "CarefulSynthesis" => Ok(Action::CarefulSynthesis),
        "Manipulation" => Ok(Action::Manipulation),
        "PrudentTouch" => Ok(Action::PrudentTouch),
        "AdvancedTouch" => Ok(Action::AdvancedTouch),
        "Reflect" => Ok(Action::Reflect),
        "PreparatoryTouch" => Ok(Action::PreparatoryTouch),
        "Groundwork" => Ok(Action::Groundwork),
        "DelicateSynthesis" => Ok(Action::DelicateSynthesis),
        "IntensiveSynthesis" => Ok(Action::IntensiveSynthesis),
        "TrainedEye" => Ok(Action::TrainedEye),
        "HeartAndSoul" => Ok(Action::HeartAndSoul),
        "PrudentSynthesis" => Ok(Action::PrudentSynthesis),
        "TrainedFinesse" => Ok(Action::TrainedFinesse),
        "RefinedTouch" => Ok(Action::RefinedTouch),
        "QuickInnovation" => Ok(Action::QuickInnovation),
        "ImmaculateMend" => Ok(Action::ImmaculateMend),
        "TrainedPerfection" => Ok(Action::TrainedPerfection),
        "RapidSynthesis" => Ok(Action::RapidSynthesis),
        "HastyTouch" => Ok(Action::HastyTouch),
        "DaringTouch" => Ok(Action::DaringTouch),
        _ => Err(format!("Unknown action: {}", name)),
    }
}

/// Minimum gap between consecutive `progress_callback` JS invocations.
/// MacroSolver fires the callback once per search batch — for large recipes that
/// can be hundreds of times per second. Throttling here keeps Rust→JS marshalling
/// and the resulting `postMessage` traffic bounded; UI smoothing is JS-side.
const PROGRESS_CALLBACK_MIN_INTERVAL_MS: f64 = 50.0;

/// Replays an action list through `SimulationState` (under Normal conditions, which
/// is what the solver itself assumes) and returns the resulting quality. Used by
/// the quality-threshold early-stop path to decide whether an intermediate solution
/// already meets the caller's target.
fn simulate_final_quality(settings: &Settings, actions: &[Action]) -> u16 {
    let mut state = SimulationState::new(settings);
    for action in actions {
        if state.is_final(settings) {
            break;
        }
        if let Ok(new_state) = state.use_action(*action, Condition::Normal, settings) {
            state = new_state;
        }
    }
    state.quality
}

#[wasm_bindgen]
pub fn solve(config_js: JsValue, progress_callback: Option<js_sys::Function>) -> Result<JsValue, JsValue> {
    let config: SolveConfig =
        serde_wasm_bindgen::from_value(config_js).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let simulator_settings = build_settings(&config);

    let solver_settings = SolverSettings {
        simulator_settings,
        allow_non_max_quality_solutions: config.allow_non_max_quality_solutions,
    };

    let interrupt_signal = AtomicFlag::new();

    // Wire quality-threshold early stop when requested by the caller. The
    // solution_callback simulates each intermediate solution to compute its
    // actual final quality (raphael's SearchScore uses `quality_upper_bound`,
    // not realised quality, so we can't read it off the score directly). When
    // the threshold is met we stash the actions and trip the interrupt; the
    // outer solve loop checks the flag at the top of every batch and unwinds
    // with SolverException::Interrupted, which we then resolve back into a
    // successful result using the stashed actions.
    let early_stop_actions: std::rc::Rc<std::cell::RefCell<Option<Vec<Action>>>> =
        std::rc::Rc::new(std::cell::RefCell::new(None));
    let solution_cb: Box<dyn Fn(&[Action])> = match config.quality_threshold {
        Some(threshold) if threshold > 0 => {
            let sim_settings = simulator_settings;
            let interrupt_for_cb = interrupt_signal.clone();
            let actions_cell = std::rc::Rc::clone(&early_stop_actions);
            Box::new(move |actions: &[Action]| {
                if interrupt_for_cb.is_set() {
                    return;
                }
                let quality = simulate_final_quality(&sim_settings, actions);
                if quality >= threshold {
                    *actions_cell.borrow_mut() = Some(actions.to_vec());
                    interrupt_for_cb.set();
                }
            })
        }
        _ => Box::new(|_actions: &[Action]| {}),
    };

    // Capture the JS function inside a throttled Rust closure. The closure swallows
    // any JS-side throw so a buggy callback can't poison the solve.
    let progress_cb: Box<dyn Fn(usize)> = match progress_callback {
        Some(js_fn) => {
            let last_emit = std::cell::Cell::new(f64::NEG_INFINITY);
            Box::new(move |processed: usize| {
                let now = js_sys::Date::now();
                if now - last_emit.get() < PROGRESS_CALLBACK_MIN_INTERVAL_MS {
                    return;
                }
                last_emit.set(now);
                let _ = js_fn.call1(&JsValue::NULL, &JsValue::from_f64(processed as f64));
            })
        }
        None => Box::new(|_processed: usize| {}),
    };

    let mut solver = MacroSolver::new(
        solver_settings,
        solution_cb,
        progress_cb,
        interrupt_signal,
    );

    let actions = match solver.solve() {
        Ok(actions) => actions,
        Err(raphael_solver::SolverException::Interrupted) => {
            // Either the early-stop callback fired (sufficient quality reached)
            // or an external cancel — only the former leaves actions stashed.
            match early_stop_actions.borrow_mut().take() {
                Some(actions) => actions,
                None => return Err(JsValue::from_str("Interrupted")),
            }
        }
        Err(e) => return Err(JsValue::from_str(&format!("{:?}", e))),
    };

    let stats = solver.runtime_stats();
    let result = SolveResult {
        actions: actions.iter().map(|a| format!("{:?}", a)).collect(),
        runtime_stats: RuntimeStats {
            search_inserted_nodes: stats.search_queue_stats.inserted_nodes,
            search_processed_nodes: stats.search_queue_stats.processed_nodes,
            finish_states: stats.finish_solver_stats.states,
            finish_values: stats.finish_solver_stats.values,
            quality_ub_states_main: stats.quality_ub_stats.states_on_main,
            quality_ub_states_shards: stats.quality_ub_stats.states_on_shards,
            quality_ub_values: stats.quality_ub_stats.values,
            step_lb_states_main: stats.step_lb_stats.states_on_main,
            step_lb_states_shards: stats.step_lb_stats.states_on_shards,
            step_lb_values: stats.step_lb_stats.values,
        },
    };

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

// --- Simulation types ---

#[derive(Deserialize)]
struct SimulateConfig {
    max_cp: u16,
    max_durability: u16,
    max_progress: u16,
    max_quality: u16,
    base_progress: u16,
    base_quality: u16,
    job_level: u8,
    actions: Vec<String>,
    /// Per-step condition override. When provided and index < actions.len(),
    /// that step is simulated under the given condition; otherwise Normal.
    /// Accepts case-insensitive "Normal" / "Good" / "Excellent" / "Poor";
    /// unknown values fall back to Normal.
    #[serde(default)]
    conditions: Option<Vec<String>>,
}

fn parse_condition(name: &str) -> Condition {
    if name.eq_ignore_ascii_case("good") {
        Condition::Good
    } else if name.eq_ignore_ascii_case("excellent") {
        Condition::Excellent
    } else if name.eq_ignore_ascii_case("poor") {
        Condition::Poor
    } else {
        Condition::Normal
    }
}

fn parse_conditions(raw: &Option<Vec<String>>) -> Vec<Condition> {
    raw.as_ref()
        .map(|v| v.iter().map(|s| parse_condition(s)).collect())
        .unwrap_or_default()
}

#[derive(Serialize)]
struct EffectsState {
    inner_quiet: u8,
    waste_not: u8,
    innovation: u8,
    veneration: u8,
    great_strides: u8,
    muscle_memory: u8,
    manipulation: u8,
    trained_perfection_available: bool,
    trained_perfection_active: bool,
    heart_and_soul_available: bool,
    heart_and_soul_active: bool,
    quick_innovation_available: bool,
}

fn effects_to_state(effects: &raphael_sim::Effects) -> EffectsState {
    EffectsState {
        inner_quiet: effects.inner_quiet(),
        waste_not: effects.waste_not(),
        innovation: effects.innovation(),
        veneration: effects.veneration(),
        great_strides: effects.great_strides(),
        muscle_memory: effects.muscle_memory(),
        manipulation: effects.manipulation(),
        trained_perfection_available: effects.trained_perfection_available(),
        trained_perfection_active: effects.trained_perfection_active(),
        heart_and_soul_available: effects.heart_and_soul_available(),
        heart_and_soul_active: effects.heart_and_soul_active(),
        quick_innovation_available: effects.quick_innovation_available(),
    }
}

#[derive(Serialize)]
struct SimulateResult {
    progress: u16,
    quality: u16,
    durability: u16,
    cp: u16,
    max_progress: u16,
    max_quality: u16,
    max_durability: u16,
    max_cp: u16,
    effects: EffectsState,
    is_finished: bool,
    is_success: bool,
    steps_used: usize,
}

#[derive(Serialize)]
struct StepDetail {
    action: String,
    progress: u16,
    quality: u16,
    durability: u16,
    cp: u16,
    effects: EffectsState,
    success: bool,
    is_finished: bool,
}

#[derive(Serialize)]
struct SimulateDetailResult {
    steps: Vec<StepDetail>,
    final_progress: u16,
    final_quality: u16,
    final_durability: u16,
    final_cp: u16,
    is_finished: bool,
    is_success: bool,
}

fn build_sim_settings(config: &SimulateConfig) -> Settings {
    Settings {
        max_cp: config.max_cp,
        max_durability: config.max_durability,
        max_progress: config.max_progress,
        max_quality: config.max_quality,
        base_progress: config.base_progress,
        base_quality: config.base_quality,
        job_level: config.job_level,
        allowed_actions: ActionMask::all(),
        adversarial: false,
        backload_progress: false,
        stellar_steady_hand_charges: 0,
    }
}

#[wasm_bindgen]
pub fn simulate(config_js: JsValue) -> Result<JsValue, JsValue> {
    let config: SimulateConfig =
        serde_wasm_bindgen::from_value(config_js).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let settings = build_sim_settings(&config);
    let mut state = SimulationState::new(&settings);
    let mut steps_used = 0;
    let conditions = parse_conditions(&config.conditions);

    for (i, action_name) in config.actions.iter().enumerate() {
        if state.is_final(&settings) {
            break;
        }
        let action = parse_action(action_name)
            .map_err(|e| JsValue::from_str(&e))?;
        let condition = conditions.get(i).copied().unwrap_or(Condition::Normal);
        match state.use_action(action, condition, &settings) {
            Ok(new_state) => {
                state = new_state;
                steps_used += 1;
            }
            Err(_) => {
                // Skip actions that can't be used (e.g. insufficient CP)
                steps_used += 1;
            }
        }
    }

    let is_success = state.progress >= settings.max_progress;
    let result = SimulateResult {
        progress: state.progress,
        quality: state.quality,
        durability: state.durability,
        cp: state.cp,
        max_progress: settings.max_progress,
        max_quality: settings.max_quality,
        max_durability: settings.max_durability,
        max_cp: settings.max_cp,
        effects: effects_to_state(&state.effects),
        is_finished: state.is_final(&settings),
        is_success,
        steps_used,
    };

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn simulate_detail(config_js: JsValue) -> Result<JsValue, JsValue> {
    let config: SimulateConfig =
        serde_wasm_bindgen::from_value(config_js).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let settings = build_sim_settings(&config);
    let mut state = SimulationState::new(&settings);
    let mut steps: Vec<StepDetail> = Vec::new();
    let conditions = parse_conditions(&config.conditions);

    for (i, action_name) in config.actions.iter().enumerate() {
        if state.is_final(&settings) {
            break;
        }
        let action = parse_action(action_name)
            .map_err(|e| JsValue::from_str(&e))?;
        let condition = conditions.get(i).copied().unwrap_or(Condition::Normal);
        let success = match state.use_action(action, condition, &settings) {
            Ok(new_state) => {
                state = new_state;
                true
            }
            Err(_) => false,
        };

        steps.push(StepDetail {
            action: action_name.clone(),
            progress: state.progress,
            quality: state.quality,
            durability: state.durability,
            cp: state.cp,
            effects: effects_to_state(&state.effects),
            success,
            is_finished: state.is_final(&settings),
        });
    }

    let is_success = state.progress >= settings.max_progress;
    let result = SimulateDetailResult {
        steps,
        final_progress: state.progress,
        final_quality: state.quality,
        final_durability: state.durability,
        final_cp: state.cp,
        is_finished: state.is_final(&settings),
        is_success,
    };

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}
