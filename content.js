(function() {
    'use strict';
    
    console.log('🎬 Netflix IMDb Extension: Script loaded');
    
    let OMDB_API_KEY = '';
    const processedTitles = new Set();
    const ratingCache = new Map();
    
    async function loadApiKey() {
        try {
            if (typeof browser !== 'undefined' && browser.storage) {
                console.log('📝 Trying browser storage...');
                const result = await browser.storage.sync.get('omdbApiKey');
                OMDB_API_KEY = result.omdbApiKey || '';
            }
            if (!OMDB_API_KEY) {
                console.log('📝 Falling back to localStorage...');
                OMDB_API_KEY = localStorage.getItem('netflix_imdb_api_key') || '';
            }
            
            console.log('🔑 API Key loaded:', OMDB_API_KEY ? 'Yes ✅' : 'No ❌');
            return OMDB_API_KEY;
        } catch (error) {
            console.error('❌ Error loading API key:', error);
            OMDB_API_KEY = localStorage.getItem('netflix_imdb_api_key') || '';
            return OMDB_API_KEY;
        }
    }
    window.addEventListener('message', function(event) {
        if (event.source !== window) return;
        
        if (event.data.type === 'API_KEY_UPDATE') {
            console.log('🔄 API key updated via message');
            OMDB_API_KEY = event.data.apiKey;
            localStorage.setItem('netflix_imdb_api_key', OMDB_API_KEY);
            processedTitles.clear();
            ratingCache.clear();
            setTimeout(processNetflixCards, 500);
        }
    });
    if (typeof browser !== 'undefined' && browser.runtime) {
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('📨 Browser message received:', message);
            if (message.action === 'apiKeyUpdated') {
                OMDB_API_KEY = message.apiKey;
                localStorage.setItem('netflix_imdb_api_key', OMDB_API_KEY);
                processedTitles.clear();
                ratingCache.clear();
                setTimeout(processNetflixCards, 500);
            }
        });
    }

    function processNetflixCards() {
        console.log('🔍 Processing Netflix cards...');
        
        if (!OMDB_API_KEY) {
            console.warn('⚠️ No API key available. Please configure in extension popup.');
            return;
        }
        
        const cardSelectors = [
            '.title-card',
            '.slider-item',
            '.gallery-item',
            '[data-uia="tile"]',
            '.titleCard',
            '.slider-refocus'
        ];
        
        let totalCards = 0;
        cardSelectors.forEach(selector => {
            const cards = document.querySelectorAll(selector);
            console.log(`📺 Found ${cards.length} cards with selector: ${selector}`);
            totalCards += cards.length;
            cards.forEach(processCard);
        });
        
        console.log(`📊 Total cards found: ${totalCards}`);
        
        if (totalCards === 0) {
            console.log('🔍 Trying alternative selectors...');
            const altSelectors = [
                '.ptrack-content',
                '.title-card-container',
                '.jawBone',
                '.titleCardList',
                '[data-list-context]'
            ];
            
            altSelectors.forEach(selector => {
                const cards = document.querySelectorAll(selector);
                console.log(`🎯 Alternative selector ${selector}: ${cards.length} cards`);
            });
        }
    }
    
    async function processCard(card) {
        if (card.querySelector('.imdb-rating')) {
            console.log('⏭️ Card already has rating, skipping');
            return;
        }
        
        const title = extractTitle(card);
        console.log('🎬 Extracted title:', title);
        
        if (!title || processedTitles.has(title)) {
            console.log('⏭️ No title or already processed:', title);
            return;
        }
        
        processedTitles.add(title);
        
        try {
            if (ratingCache.has(title)) {
                console.log('💾 Using cached rating for:', title);
                const rating = ratingCache.get(title);
                if (rating) {
                    addRatingToCard(card, rating);
                }
                return;
            }
            
            console.log('🌐 Fetching rating for:', title);
            const rating = await fetchIMDbRating(title);
            console.log('⭐ Rating result:', rating);
            
            if (rating) {
                ratingCache.set(title, rating);
                addRatingToCard(card, rating);
                console.log('✅ Rating added to card for:', title);
            } else {
                ratingCache.set(title, null);
                console.log('❌ No rating found for:', title);
            }
        } catch (error) {
            console.error('❌ Error processing card for:', title, error);
        }
    }
    
    function extractTitle(card) {
        const selectors = [
            '.fallback-text',
            '.video-title',
            'img[alt]',
            '.title',
            '[data-uia="video-title"]',
            '.titlecard-title'
        ];
        
        for (let selector of selectors) {
            const element = card.querySelector(selector);
            if (element) {
                let title = element.textContent?.trim() || element.alt?.trim();
                console.log(`📝 Found title with ${selector}:`, title);
                title = cleanTitle(title);
                if (title) return title;
            }
        }
        
        console.log('⚠️ No title found in card');
        return null;
    }
    
    function cleanTitle(title) {
        if (!title) return null;
        const originalTitle = title;
        title = title.replace(/\s*\(\d{4}\).*$/, '');
        title = title.replace(/\s*:\s*Season \d+.*$/i, '');
        title = title.replace(/\s*-\s*Season \d+.*$/i, '');
        title = title.replace(/\s*\(Limited Series\)$/i, '');
        
        const cleanedTitle = title.trim();
        if (originalTitle !== cleanedTitle) {
            console.log('🧹 Cleaned title:', originalTitle, '→', cleanedTitle);
        }
        return cleanedTitle;
    }
    
    let requestQueue = [];
    let isProcessingQueue = false;
    
    async function fetchIMDbRating(title) {
        return new Promise((resolve) => {
            requestQueue.push({ title, resolve });
            processQueue();
        });
    }
    
    async function processQueue() {
        if (isProcessingQueue || requestQueue.length === 0) return;
        
        isProcessingQueue = true;
        console.log('🚀 Processing API queue, items:', requestQueue.length);
        
        while (requestQueue.length > 0) {
            const { title, resolve } = requestQueue.shift();
            
            try {
                const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${OMDB_API_KEY}`;
                console.log('📡 API Request:', url);
                
                const response = await fetch(url);
                const data = await response.json();
                console.log('📥 API Response for', title, ':', data);
                
                if (data.Response === 'True' && data.imdbRating && data.imdbRating !== 'N/A') {
                    resolve({
                        rating: data.imdbRating,
                        votes: data.imdbVotes,
                        year: data.Year,
                        type: data.Type
                    });
                } else {
                    console.log('❌ No valid rating in API response:', data.Error || 'No rating available');
                    resolve(null);
                }
            } catch (error) {
                console.error('❌ API Error for', title, ':', error);
                resolve(null);
            }
            
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        isProcessingQueue = false;
    }
    
    function addRatingToCard(card, ratingData) {
        console.log('🎨 Adding rating to card:', ratingData);
        
        const ratingElement = document.createElement('div');
        ratingElement.className = 'imdb-rating';
        
        ratingElement.innerHTML = `
            <div class="imdb-badge">
                <span class="imdb-logo">IMDb</span>
                <span class="imdb-score">${ratingData.rating}</span>
                ${ratingData.year ? `<span class="imdb-year">${ratingData.year}</span>` : ''}
            </div>
        `;
        
        const titleElement = card.querySelector('.fallback-text, .video-title');
        if (titleElement && titleElement.parentNode) {
            titleElement.parentNode.style.position = 'relative';
            titleElement.parentNode.appendChild(ratingElement);
            console.log('✅ Rating added to title element parent');
        } else {
            card.style.position = 'relative';
            card.appendChild(ratingElement);
            console.log('✅ Rating added directly to card');
        }
    }
    
    function setupObserver() {
        console.log('👁️ Setting up mutation observer');
        
        const observer = new MutationObserver((mutations) => {
            let shouldProcess = false;
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) { 
                            if (node.matches && (node.matches('.title-card, .slider-item, .gallery-item, [data-uia="tile"]') ||
                                node.querySelector('.title-card, .slider-item, .gallery-item, [data-uia="tile"]'))) {
                                shouldProcess = true;
                            }
                        }
                    });
                }
            });
            
            if (shouldProcess) {
                console.log('🔄 New content detected, processing cards...');
                setTimeout(processNetflixCards, 1000);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    async function init() {
        console.log('🚀 Initializing extension...');
        
        await loadApiKey();
        
        if (!OMDB_API_KEY) {
            console.warn('⚠️ Netflix IMDb Extension: Please set your API key in the extension popup');
            // Try to get API key from popup input manually
            setTimeout(() => {
                const savedKey = localStorage.getItem('netflix_imdb_api_key');
                if (savedKey) {
                    OMDB_API_KEY = savedKey;
                    console.log('🔑 Found API key in localStorage, reprocessing...');
                    setTimeout(processNetflixCards, 1000);
                }
            }, 3000);
            return;
        }
        
        console.log('⏰ Waiting 2 seconds then processing cards...');
        setTimeout(processNetflixCards, 2000);
        setupObserver();

        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                console.log('🔄 URL changed, reprocessing cards...');
                setTimeout(processNetflixCards, 2000);
            }
        }).observe(document, { subtree: true, childList: true });
        
        console.log('✅ Extension initialized successfully');
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();