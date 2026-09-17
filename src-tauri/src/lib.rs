// 页面 JS 可调用：把运行状态报告到主进程日志（打包后验证用）
#[tauri::command]
fn report(msg: String) {
    println!("[页面报告] {msg}");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![report])
        .on_page_load(|_webview, payload| {
            println!(
                "[页面加载] {:?} -> {}",
                payload.event(),
                payload.url()
            );
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
