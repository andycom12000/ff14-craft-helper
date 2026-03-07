use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

use raphael_sim::Action;
use raphael_sim::ActionMask;
use raphael_sim::Settings;
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

#[wasm_bindgen]
pub fn solve(config_js: JsValue) -> Result<JsValue, JsValue> {
    let config: SolveConfig =
        serde_wasm_bindgen::from_value(config_js).map_err(|e| JsValue::from_str(&e.to_string()))?;

    // Start with all actions, then remove based on config toggles
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

    let simulator_settings = Settings {
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
    };

    let solver_settings = SolverSettings {
        simulator_settings,
        allow_non_max_quality_solutions: false,
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
