// Suppress console window on Windows release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    omni_lib::run();
}
