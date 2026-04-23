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
}

#[derive(Serialize)]
struct SolveResult {
    actions: Vec<String>,
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

#[wasm_bindgen]
pub fn solve(config_js: JsValue) -> Result<JsValue, JsValue> {
    let config: SolveConfig =
        serde_wasm_bindgen::from_value(config_js).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let simulator_settings = build_settings(&config);

    let solver_settings = SolverSettings {
        simulator_settings,
        allow_non_max_quality_solutions: true,
    };

    let interrupt_signal = AtomicFlag::new();

    let mut solver = MacroSolver::new(
        solver_settings,
        Box::new(|_actions: &[Action]| {}),
        Box::new(|_progress: usize| {}),
        interrupt_signal,
    );

    let actions = solver
        .solve()
        .map_err(|e| JsValue::from_str(&format!("{:?}", e)))?;

    let result = SolveResult {
        actions: actions.iter().map(|a| format!("{:?}", a)).collect(),
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
    match name.to_ascii_lowercase().as_str() {
        "good" => Condition::Good,
        "excellent" => Condition::Excellent,
        "poor" => Condition::Poor,
        _ => Condition::Normal,
    }
}

fn condition_for_step(conditions: &Option<Vec<String>>, step: usize) -> Condition {
    conditions
        .as_ref()
        .and_then(|c| c.get(step))
        .map(|s| parse_condition(s))
        .unwrap_or(Condition::Normal)
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

    for (i, action_name) in config.actions.iter().enumerate() {
        if state.is_final(&settings) {
            break;
        }
        let action = parse_action(action_name)
            .map_err(|e| JsValue::from_str(&e))?;
        let condition = condition_for_step(&config.conditions, i);
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

    for (i, action_name) in config.actions.iter().enumerate() {
        if state.is_final(&settings) {
            break;
        }
        let action = parse_action(action_name)
            .map_err(|e| JsValue::from_str(&e))?;
        let condition = condition_for_step(&config.conditions, i);
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
