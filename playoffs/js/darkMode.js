/* js/darkMode.js */

document.addEventListener('DOMContentLoaded', () => {
    // Check if dark mode is explicitly disabled in cookies
    const cookieValue = document.cookie.split('; ').find(row => row.startsWith('darkMode='))?.split('=')[1];
    const isDarkMode = cookieValue !== 'false';

    // Create toggle UI
    const toggleContainer = document.createElement('div');
    toggleContainer.style.position = 'fixed';
    toggleContainer.style.bottom = '20px';
    toggleContainer.style.right = '20px';
    toggleContainer.style.zIndex = '9999';
    toggleContainer.style.background = '#ffffff';
    toggleContainer.style.padding = '10px';
    toggleContainer.style.borderRadius = '50px';
    toggleContainer.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    toggleContainer.style.display = 'flex';
    toggleContainer.style.alignItems = 'center';
    toggleContainer.style.justifyContent = 'center';
    toggleContainer.style.width = '45px';
    toggleContainer.style.height = '45px';
    toggleContainer.style.cursor = 'pointer';
    toggleContainer.style.transition = 'all 0.3s ease';

    // Apply dark mode styles to the toggle itself if in dark mode
    if (isDarkMode) {
        toggleContainer.style.background = '#16213e';
        toggleContainer.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';
    }

    const label = document.createElement('span');
    label.innerText = isDarkMode ? '🌙' : '☀️';
    label.style.fontSize = '24px';
    label.style.userSelect = 'none';
    label.style.lineHeight = '1';

    toggleContainer.appendChild(label);
    document.body.appendChild(toggleContainer);

    toggleContainer.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark-mode');
        
        if (isDark) {
            document.documentElement.setAttribute('data-bs-theme', 'dark');
            toggleContainer.style.background = '#16213e';
            toggleContainer.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';
        } else {
            document.documentElement.removeAttribute('data-bs-theme');
            toggleContainer.style.background = '#ffffff';
            toggleContainer.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        }
        
        document.cookie = `darkMode=${isDark}; path=/; max-age=31536000`; // 1 year
        label.innerText = isDark ? '🌙' : '☀️';
    });
});
