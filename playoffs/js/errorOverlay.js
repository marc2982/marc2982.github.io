export function showGlobalError(err) {
    const errorHtml = `
        <div style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(220, 38, 38, 0.98); color: white; z-index: 99999; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: sans-serif; padding: 40px; box-sizing: border-box; text-align: left;">
            <h1 style="font-size: 4rem; margin-bottom: 10px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">🚨 Uh oh!</h1>
            <h2 style="font-size: 1.8rem; margin-bottom: 30px; text-align: center;">Take a picture of this screen and send it to Marc</h2>
            <div style="background: rgba(0, 0, 0, 0.7); padding: 25px; border-radius: 12px; width: 100%; max-width: 900px; overflow-x: auto; overflow-y: auto; max-height: 50vh; font-family: monospace; font-size: 1.1rem; line-height: 1.5; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                <p style="color: #fca5a5; font-weight: bold; margin-top: 0; margin-bottom: 15px; border-bottom: 1px solid #7f1d1d; padding-bottom: 10px;">[ERROR] ${err.message}</p>
                <pre style="margin: 0; white-space: pre-wrap; color: #e5e5e5;">${err.stack || err}</pre>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('afterbegin', errorHtml);
    
    const hideIfFound = (id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    };
    
    hideIfFound('main-content');
    hideIfFound('loading');
    hideIfFound('app');
}
