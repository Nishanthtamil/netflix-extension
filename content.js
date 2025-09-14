function processNetflixCards() {
        if (!OMDB_API_KEY) {
            console.log('No API key available. Please configure in extension popup.');
            return;
        const cardSelectors = [
            '.title-card',
            '.slider-item',
            '.gallery-item',
            '[data-uia="tile"]',
            '.titleCard',
            '.slider-refocus'
        ];
        
        cardSelectors.forEach(selector => {
            const cards = document.querySelectorAll(selector);
            cards.forEach(processCard);
        });
    }
    
    async function processCard(card) {
        if (card.querySelector('.imdb-rating')) return; 
        
        const title = extractTitle(card);
        if (!title || processedTitles.has(title)) return;
        
        processedTitles.add(title);
        
        try {
            if (ratingCache.has(title)) {
                const rating = ratingCache.get(title);
                if (rating) {
                    addRatingToCard(card, rating);
                }
                return;
            }
            
            const rating = await fetchIMDbRating(title);
            if (rating) {
                ratingCache.set(title, rating);
                addRatingToCard(card, rating);
            } else {
                ratingCache.set(title, null); 
            }
        } catch (error) {
            console.log('Error fetching rating for:', title, error);
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
                title = cleanTitle(title);
                if (title) return title;
            }
        }
        return null;
    }
    function cleanTitle(title) {
        if (!title) return null;
        title = title.replace(/\s*\(\d{4}\).*$/, '');
        title = title.replace(/\s*:\s*Season \d+.*$/i, '');
        title = title.replace(/\s*-\s*Season \d+.*$/i, '');
        title = title.replace(/\s*\(Limited Series\)$/i, '');
        
        return title.trim();
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
        
        while (requestQueue.length > 0) {
            const { title, resolve } = requestQueue.shift();
            
            try {
                const response = await fetch(
                    `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${OMDB_API_KEY}`
                );
                const data = await response.json();
                
                if (data.Response === 'True' && data.imdbRating && data.imdbRating !== 'N/A') {
                    resolve({
                        rating: data.imdbRating,
                        votes: data.imdbVotes,
                        year: data.Year,
                        type: data.Type
                    });
                } else {
                    resolve(null);
                }
            } catch (error) {
                console.error('API Error for', title, ':', error);
                resolve(null);
            }
            
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        isProcessingQueue = false;
    }
    
    function addRatingToCard(card, ratingData) {
        const ratingElement = document.createElement('div');
        ratingElement.className = 'imdb-rating';
        
        const typeIcon = ratingData.type === 'series' ? '📺' : '🎬';
        
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
        } else {
            card.style.position = 'relative';
            card.appendChild(ratingElement);
        }
    }
    
    function setupObserver() {
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
                setTimeout(processNetflixCards, 1000);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    async function init() {
        await loadApiKey();
        
        if (!OMDB_API_KEY) {
            console.log('Netflix IMDb Extension: Please set your API key in the extension popup');
            return;
        }
        setTimeout(processNetflixCards, 2000);
        setupObserver();

        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                setTimeout(processNetflixCards, 2000);
            }
        }).observe(document, { subtree: true, childList: true });
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}