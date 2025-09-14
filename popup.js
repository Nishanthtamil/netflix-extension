document.addEventListener('DOMContentLoaded', function() {
    const apiKeyInput = document.getElementById('apikey');
    const saveButton = document.getElementById('saveKey');
    const statusDiv = document.getElementById('status');
    
    function loadApiKey() {
        if (typeof browser !== 'undefined' && browser.storage) {
            browser.storage.sync.get('omdbApiKey').then(result => {
                if (result.omdbApiKey) {
                    apiKeyInput.value = result.omdbApiKey;
                }
            }).catch(() => {
                const savedKey = localStorage.getItem('netflix_imdb_api_key');
                if (savedKey) {
                    apiKeyInput.value = savedKey;
                }
            });
        } else {
            const savedKey = localStorage.getItem('netflix_imdb_api_key');
            if (savedKey) {
                apiKeyInput.value = savedKey;
            }
        }
    }
    
    loadApiKey();
    saveButton.addEventListener('click', function() {
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            showStatus('Please enter an API key', 'error');
            return;
        }
        
        if (apiKey.length < 8) {
            showStatus('API key seems too short', 'error');
            return;
        }
        
        testApiKey(apiKey).then(isValid => {
            if (isValid) {
                localStorage.setItem('netflix_imdb_api_key', apiKey);
                
                if (typeof browser !== 'undefined' && browser.storage) {
                    browser.storage.sync.set({omdbApiKey: apiKey}).catch(() => {
                        console.log('Browser storage not available, using localStorage only');
                    });
                }
                
                showStatus('API key saved successfully!', 'success');
                
                notifyContentScript(apiKey);
                
            } else {
                showStatus('Invalid API key. Please check and try again.', 'error');
            }
        }).catch(error => {
            showStatus('Error validating API key', 'error');
        });
    });
    function notifyContentScript(apiKey) {
        if (typeof browser !== 'undefined' && browser.tabs) {
            browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
                if (tabs[0] && tabs[0].url.includes('netflix.com')) {
                    browser.tabs.sendMessage(tabs[0].id, {
                        action: 'apiKeyUpdated',
                        apiKey: apiKey
                    }).catch(() => {
                        console.log('Browser messaging not available');
                    });
                }
            }).catch(() => {
                console.log('Browser tabs API not available');
            });
        }
        
        if (typeof browser !== 'undefined' && browser.tabs) {
            browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
                if (tabs[0] && tabs[0].url.includes('netflix.com')) {
                    browser.tabs.executeScript(tabs[0].id, {
                        code: `
                            localStorage.setItem('netflix_imdb_api_key', '${apiKey}');
                            window.postMessage({type: 'API_KEY_UPDATE', apiKey: '${apiKey}'}, '*');
                            console.log('API key updated via executeScript');
                        `
                    }).catch(() => {
                        console.log('Script execution not available');
                    });
                }
            }).catch(() => {
                console.log('Execute script not available');
            });
        }
    }
    async function testApiKey(apiKey) {
        try {
            const response = await fetch(`https://www.omdbapi.com/?t=inception&apikey=${apiKey}`);
            const data = await response.json();
            return data.Response === 'True' || data.Error !== 'Invalid API key!';
        } catch (error) {
            return false;
        }
    }
    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
});