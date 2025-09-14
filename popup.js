document.addEventListener('DOMContentLoaded', function() {
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('saveKey');
    const statusDiv = document.getElementById('status');
    
    browser.storage.sync.get('omdbApiKey').then(result => {
        if (result.omdbApiKey) {
            apiKeyInput.value = result.omdbApiKey;
        }
    });
    
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
                browser.storage.sync.set({omdbApiKey: apiKey}).then(() => {
                    showStatus('API key saved successfully!', 'success');
                    
                    browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
                        if (tabs[0] && tabs[0].url.includes('netflix.com')) {
                            browser.tabs.sendMessage(tabs[0].id, {
                                action: 'apiKeyUpdated',
                                apiKey: apiKey
                            });
                        }
                    });
                });
            } else {
                showStatus('Invalid API key. Please check and try again.', 'error');
            }
        }).catch(error => {
            showStatus('Error validating API key', 'error');
        });
    });
    
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