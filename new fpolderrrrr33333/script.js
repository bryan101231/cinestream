const API_TOKEN = CONFIG.TMDB_TOKEN; 
const BASE_URL = "https://api.themoviedb.org/3";
const IMG_PATH = "https://image.tmdb.org/t/p/w300";
const BACKDROP_PATH = "https://image.tmdb.org/t/p/original";

let currentShowId, currentShowName, currentType;
let currentModalItem = null; // To store the item currently in the modal

// Expanded and Renamed Servers
const myServers = [
    { name: "Main", url: "vidsrc.to" },
    { name: "VidLink", url: "vidlink.pro" },
    { name: "2Embed", url: "2embed.me" },
    { name: "Embed.su", url: "embed.su" },
    { name: "Vidsrc.xyz", url: "vidsrc.xyz" },
    { name: "AutoEmbed", url: "autoembed.to" },
    { name: "Backup", url: "vidsrc.cc" }
];
let serverIdx = 0;

// Playback State from player.js
let currentS = 1;
let currentE = 1;
let maxE = 0;
let currentPlaybackItem = null;
let isTheaterMode = false;
let iframeLoadWatchdog = null;

const videoCache = {}; // To store video keys: { itemId: 'youtubeKey' }
let searchTimeout = null;

window.onload = () => {
    showSkeletons(['anime-grid', 'seasonal-grid', 'movies-grid', 'top-rated-grid', 'studio-grid']);
    fetchHero();
    fetchCategory('anime', 'anime-grid');
    fetchCategory('seasonal', 'seasonal-grid');
    fetchCategory('movies', 'movies-grid');
    fetchCategory('top-rated', 'top-rated-grid');
    fetchCategory('studio', 'studio-grid');
    renderHistory();
    renderFavorites();
    detectAdBlock();
    renderServerButtons();

    // Add Enter key listener for search
    const searchInput = document.getElementById('user-search');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchContent();
        });
    }
};

function showSkeletons(grids) {
    grids.forEach(id => document.getElementById(id).innerHTML = Array(20).fill('<div class="skeleton skeleton-load"></div>').join(''));
}

async function fetchHero() {
    const res = await fetch(`${BASE_URL}/trending/all/day`, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
    const data = await res.json();
    const items = data.results.filter(i => i.backdrop_path);
    const randomItem = items[Math.floor(Math.random() * items.length)];
    if(randomItem) updateDynamicBackground(BACKDROP_PATH + randomItem.backdrop_path);
    renderHero(randomItem);
}

function renderHero(item) {
    const hero = document.getElementById('hero-section');
    const content = document.getElementById('hero-content');
    const title = item.name || item.title;
    hero.style.backgroundImage = `linear-gradient(0deg, #141414 5%, transparent 100%), url(${BACKDROP_PATH + item.backdrop_path})`;
    content.innerHTML = `
        <h1 class="hero-title">${title} <i class="fab fa-whatsapp whatsapp-btn" title="Share" onclick="shareToWhatsApp()"></i></h1>
        <p class="hero-desc">${item.overview ? item.overview.slice(0, 150) + '...' : ''}</p>
        <div class="hero-btns">
            <button class="play-btn" onclick='handleSelection(${JSON.stringify(item).replace(/'/g, "&apos;")})'>▶ Play</button>
            <button class="play-btn" style="background: rgba(100,100,100,0.5); color:white;" onclick='toggleFavorite(${JSON.stringify(item).replace(/'/g, "&apos;")})'>+ My List</button>
        </div>
    `;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function fetchCategory(type, gridId) {
    const fetchPage = async (page) => {
        let url;
        if (type === 'anime') {
            url = `${BASE_URL}/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${page}`;
        } else if (type === 'seasonal') {
            url = `${BASE_URL}/discover/tv?with_genres=16&air_date.gte=2024-03-01&air_date.lte=2024-06-31&sort_by=popularity.desc&page=${page}`;
        } else if (type === 'movies') {
            url = `${BASE_URL}/discover/movie?with_genres=16&sort_by=popularity.desc&page=${page}`;
        } else if (type === 'top-rated') {
            url = `${BASE_URL}/tv/top_rated?with_genres=16&page=${page}`;
        } else if (type === 'studio') {
            url = `${BASE_URL}/discover/tv?with_companies=10342&sort_by=popularity.desc&page=${page}`; // MAPPA ID
        } else {
            url = `${BASE_URL}/discover/tv?with_genres=16&with_original_language=en&sort_by=popularity.desc&page=${page}`;
        }
        const res = await fetch(url, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
        const data = await res.json();
        return data.results || [];
    };

    // Fetch two pages of results to get ~40 items, then shuffle and slice 30
    const [page1, page2] = await Promise.all([fetchPage(1), fetchPage(2)]);
    let combinedResults = [...page1, ...page2];
    
    const finalItems = shuffleArray(combinedResults).slice(0, 30);
    renderGrid(finalItems, gridId);
}

function renderGrid(results, gridId) {
    const grid = document.getElementById(gridId);
    grid.innerHTML = '';
    results.forEach(item => {
        if (!item.poster_path && !item.poster) return;
        const title = item.name || item.title;
        const overview = item.overview ? item.overview.slice(0, 100) + '...' : 'No description available.';
        const poster = item.poster || IMG_PATH + item.poster_path;
        const mediaType = item.media_type || (item.name ? 'tv' : 'movie'); // Determine media type
        const progress = (item.lastSeason && item.lastEpisode) ? `<div class="progress-badge">S${item.lastSeason} E${item.lastEpisode}</div>` : '';
        const isHistory = gridId === 'history-grid';
        const randomProgress = Math.floor(Math.random() * 60) + 30; // Just for visual flair

        const card = document.createElement('div');
        card.className = `movie-card card-3d-effect ${isHistory ? 'history-item' : ''}`;
        card.dataset.id = item.id;
        card.dataset.mediatype = mediaType; // Store media type
        card.innerHTML = `
            <div class="badge">⭐ ${item.vote_average ? item.vote_average.toFixed(1) : 'N/A'}</div>
            ${progress}
            <button class="fav-btn-round" onclick='event.stopPropagation(); toggleFavorite(${JSON.stringify(item).replace(/'/g, "&apos;")})'>❤</button>
            <img src="${poster}" alt="${title}" loading="lazy">
            <div class="card-overlay">
                <div class="card-description-content">
                    <div class="play-icon">▶</div>
                    <p class="card-desc">${overview}</p>
                </div>
            </div>
            <div class="progress-container">
                <div class="progress-fill" style="width: ${isHistory ? randomProgress : 0}%"></div>
            </div>
            <p style="font-size:12px; margin-top:5px; text-align:center;">${title}</p>
        `;
        card.onclick = () => handleSelection(item);
        grid.appendChild(card);
    });
}

function handleSelection(item) {
    openQuickViewModal(item);
}

async function openQuickViewModal(item) {
    currentModalItem = item; // Store the item for modal actions

    const modal = document.getElementById('quick-view-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalOverview = document.getElementById('modal-overview');
    const modalTrailerContainer = modal.querySelector('.modal-trailer-container');
    const modalSeasonEpisodeSelector = document.getElementById('modal-season-episode-selector');
    const modalSeasonDropdown = document.getElementById('modal-season-dropdown');
    const modalEpisodeGrid = document.getElementById('modal-episode-grid');
    const modalPlayBtn = document.getElementById('modal-play-btn');
    const modalMaximizeBtn = document.getElementById('modal-maximize-btn');
    const modalFavBtn = document.getElementById('modal-fav-btn');

    modalTitle.innerHTML = `${item.name || item.title} <i class="fab fa-whatsapp whatsapp-btn" onclick="shareToWhatsApp()"></i>`;
    modalOverview.textContent = item.overview || 'No description available.';

    // Clear previous trailer
    modalTrailerContainer.innerHTML = '';

    // Fetch and display trailer
    const videoKey = await getVideosForItem(item.id, item.media_type || (item.name ? 'tv' : 'movie'));
    if (videoKey) {
        modalTrailerContainer.innerHTML = `
            <iframe src="https://www.youtube.com/embed/${videoKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoKey}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
        `;
    } else {
        modalTrailerContainer.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%; color:#ccc;">No trailer available.</div>';
    }

    // Handle Play button click
    modalPlayBtn.onclick = () => startPlayback(item);
    
    // Handle Maximize button click
    modalMaximizeBtn.onclick = () => maximizeToPlayer(item, videoKey);
    
    // Handle Favorite button click
    updateModalPlayerFavBtn(item); // Set initial state
    modalFavBtn.onclick = () => {
        toggleFavorite(item);
        updateModalPlayerFavBtn(item); // Update button state after toggling
    };

    // Handle seasons/episodes for TV shows
    if ((item.media_type === 'tv' || item.name) && item.id) {
        modalSeasonEpisodeSelector.style.display = 'block';
        const res = await fetch(`${BASE_URL}/tv/${item.id}`, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
        const data = await res.json();
        const seasons = data.seasons.filter(s => s.season_number > 0);
        modalSeasonDropdown.innerHTML = seasons.map(s => `<option value="${s.season_number}" data-eps="${s.episode_count}">${s.name}</option>`).join('');

        // Set default season to the last watched or first season
        const history = JSON.parse(localStorage.getItem('cineHistory')) || [];
        const savedItem = history.find(h => h.id === item.id);
        const startSeason = savedItem?.lastSeason || 1;
        modalSeasonDropdown.value = seasons.some(s => s.season_number == startSeason) ? startSeason : seasons[0].season_number;

        // Populate episodes for the selected season
        changeModalSeason(savedItem?.lastEpisode || 1); // Pass last watched episode
        modalSeasonDropdown.onchange = () => changeModalSeason();

    } else {
        modalSeasonEpisodeSelector.style.display = 'none';
    }

    modal.classList.add('show');
}

function closeModal() {
    const modal = document.getElementById('quick-view-modal');
    modal.classList.remove('show');
    // Stop trailer playback when modal closes
    modal.querySelector('.modal-trailer-container').innerHTML = '';
    currentModalItem = null;
}

async function changeModalSeason(targetEpisode = 1) {
    const modalSeasonDropdown = document.getElementById('modal-season-dropdown');
    const modalEpisodeGrid = document.getElementById('modal-episode-grid');
    const sNum = modalSeasonDropdown.value;
    const epCount = modalSeasonDropdown.options[modalSeasonDropdown.selectedIndex].getAttribute('data-eps');
    modalEpisodeGrid.innerHTML = '';

    for (let i = 1; i <= epCount; i++) {
        const btn = document.createElement('button');
        btn.className = 'ep-btn';
        btn.innerText = `Ep ${i}`;
        btn.onclick = () => startPlayback(currentModalItem, sNum, i);
        if (i == targetEpisode) {
            btn.classList.add('active-episode'); // Highlight the selected episode
        }
        modalEpisodeGrid.appendChild(btn);
    }
}

function updateModalPlayerFavBtn(item) {
    const btn = document.getElementById('modal-fav-btn');
    const favorites = JSON.parse(localStorage.getItem('cineFavs')) || [];
    const exists = favorites.find(f => f.id === item.id);

    btn.innerHTML = exists ? '➖ Remove from List' : '➕ Add to My List';
    btn.style.background = exists ? 'rgba(229, 9, 20, 0.7)' : 'rgba(100,100,100,0.5)';
}

// New function to handle actual playback
function startPlayback(item, season = 1, episode = 1, initialTrailerKey = null) {
    closeModal(); // Close the quick view modal
    document.body.classList.add('lights-out'); // Dim the background
    
    showVideoAd(); // Trigger the ad sequence

    currentPlaybackItem = item; // Keep track for "Next Episode" and "Server Switch"
    const type = (item.name || item.media_type === 'tv') ? 'tv' : 'movie';
    saveHistory(item); // Save to history before leaving

    // Update Ambient Glow
    const glow = document.getElementById('player-glow');
    const backdrop = item.backdrop_path || item.poster_path;
    if (glow && backdrop) {
        glow.style.backgroundImage = `url(${BACKDROP_PATH + backdrop})`;
    }

    const container = document.getElementById('inline-player-container');
    const iframe = document.getElementById('inline-iframe');
    const loader = document.getElementById('player-loader');
    const nextBtn = document.getElementById('next-episode-btn');
    
    const server = myServers[serverIdx].url;
    currentS = parseInt(season);
    currentE = parseInt(episode);

    // Reset Status indicators
    const statusTag = document.getElementById('server-status');
    statusTag.classList.remove('status-error');

    // Show loader
    loader.style.display = 'block';
    
    // Watchdog to detect slow/failed loads
    clearTimeout(iframeLoadWatchdog);
    iframeLoadWatchdog = setTimeout(() => {
        if (loader.style.display !== 'none') {
            statusTag.classList.add('status-error');
            statusTag.innerHTML = `⚠️ CONNECTION SLOW: TRY SWITCHING SERVER`;
        }
    }, 10000); // 10 second threshold

    iframe.onload = () => {
        loader.style.display = 'none';
        clearTimeout(iframeLoadWatchdog);
    };

    if (initialTrailerKey) {
        iframe.src = `https://www.youtube.com/embed/${initialTrailerKey}?autoplay=1&controls=1`;
    } else {
        // Enhanced URL construction for multi-server compatibility
        if (server.includes("vidlink.pro")) {
            iframe.src = type === 'tv' 
                ? `https://vidlink.pro/embed/tv/${item.id}/${currentS}/${currentE}`
                : `https://vidlink.pro/embed/movie/${item.id}`;
        } else {
            // Standard Vidsrc/2Embed pattern
            iframe.src = type === 'tv' 
                ? `https://${server}/embed/tv/${item.id}/${currentS}/${currentE}`
                : `https://${server}/embed/movie/${item.id}`;
        }
    }
    updateServerIndicator();
    renderServerButtons(); // Refresh active state

    // Logic for Next Episode button visibility
    if (type === 'tv') {
        setupPlayerControls(item, season, episode);
    } else {
        nextBtn.style.display = 'none';
        document.getElementById('player-tv-controls').style.display = 'none';
    }
        
    container.style.display = 'flex';
    document.body.classList.add('modal-open');
}

function maximizeToPlayer(item, trailerKey) {
    // Open player with trailer active first
    startPlayback(item, 1, 1, trailerKey);
}

function toggleTheaterMode() {
    const container = document.getElementById('inline-player-container');
    const btn = document.getElementById('theater-toggle');
    isTheaterMode = !isTheaterMode;
    
    container.classList.toggle('theater-active', isTheaterMode);
    btn.innerText = isTheaterMode ? "❐ Default View" : "⛶ Theater Mode";
}

async function setupPlayerControls(item, season, episode) {
    const tvControls = document.getElementById('player-tv-controls');
    const seasonSelect = document.getElementById('player-season-select');
    const episodeSelect = document.getElementById('player-episode-select');
    
    tvControls.style.display = 'flex';

    // Fetch TV details to get total seasons if not already done
    const res = await fetch(`${BASE_URL}/tv/${item.id}`, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
    const data = await res.json();
    const seasons = data.seasons.filter(s => s.season_number > 0);

    seasonSelect.innerHTML = seasons.map(s => `<option value="${s.season_number}" data-eps="${s.episode_count}">${s.name}</option>`).join('');
    seasonSelect.value = season;

    const updateEpisodes = (sNum, targetEp) => {
        const sOption = seasonSelect.options[seasonSelect.selectedIndex];
        const epCount = sOption.getAttribute('data-eps');
        maxE = parseInt(epCount);
        
        episodeSelect.innerHTML = '';
        for (let i = 1; i <= epCount; i++) {
            episodeSelect.innerHTML += `<option value="${i}">Episode ${i}</option>`;
        }
        episodeSelect.value = targetEp;
        document.getElementById('next-episode-btn').style.display = (targetEp < maxE) ? 'block' : 'none';
    };

    updateEpisodes(season, episode);

    seasonSelect.onchange = () => {
        updateEpisodes(seasonSelect.value, 1);
        startPlayback(item, seasonSelect.value, 1);
    };
    episodeSelect.onchange = () => startPlayback(item, seasonSelect.value, episodeSelect.value);
}

function toggleFavoritesView() {
    const section = document.getElementById('favorites-section');
    section.classList.toggle('show');
}

async function getVideosForItem(itemId, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const res = await fetch(`${BASE_URL}/${type}/${itemId}/videos`, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
    const data = await res.json();
    const videos = data.results.filter(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
    if (videos.length > 0) {
        // Prioritize Trailer, then Teaser
        const trailer = videos.find(v => v.type === 'Trailer');
        return trailer ? trailer.key : videos[0].key;
    }
    return null;
}

function playVideo(container, videoKey) {
    container.innerHTML = `
        <iframe src="https://www.youtube.com/embed/${videoKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoKey}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen style="width:100%; height:100%; position:absolute; top:0; left:0; pointer-events: none;"></iframe>
    `;
}

function saveHistory(item, s = null, e = null) {
    let history = JSON.parse(localStorage.getItem('cineHistory')) || [];
    history = history.filter(h => h.id !== item.id);
    
    history.unshift({
        id: item.id, 
        name: item.name || item.title, 
        poster: item.poster || IMG_PATH + item.poster_path,
        overview: item.overview,
        vote_average: item.vote_average,
        media_type: item.media_type || (item.name ? 'tv' : 'movie'), // Store media_type
        lastSeason: s,
        lastEpisode: e
    });
    localStorage.setItem('cineHistory', JSON.stringify(history.slice(0, 6)));

    // Re-render history grid to update progress bar
    if (document.getElementById('history-section').style.display === 'block') {
        renderHistory();
    }
}

function toggleSearchBar() {
    const searchInput = document.getElementById('user-search');
    searchInput.classList.toggle('expanded');
}

function renderHistory() {
    const history = JSON.parse(localStorage.getItem('cineHistory')) || [];
    if (history.length > 0) {
        document.getElementById('history-section').style.display = 'block';
        renderGrid(history, 'history-grid');
    }
}

function clearHistory() {
    localStorage.removeItem('cineHistory');
    document.getElementById('history-section').style.display = 'none';
    document.getElementById('history-grid').innerHTML = '';
}

function toggleFavorite(item) {
    let favorites = JSON.parse(localStorage.getItem('cineFavs')) || [];
    const exists = favorites.find(f => f.id === item.id);
    if (exists) {
        favorites = favorites.filter(f => f.id !== item.id);
    } else {
        favorites.unshift({
            id: item.id, 
            name: item.name || item.title, 
            poster: item.poster || IMG_PATH + item.poster_path, 
            vote_average: item.vote_average,
            overview: item.overview,
            media_type: item.media_type || (item.name ? 'tv' : 'movie') // Store media_type
        });
    }
    localStorage.setItem('cineFavs', JSON.stringify(favorites));
    renderFavorites();
}

async function filterByMediaType(type, el) {
    // 1. UI Feedback: Update active state in menu
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    if (el) el.classList.add('active');

    // 2. Clear view and prepare grid
    document.getElementById('hero-section').style.display = 'none';
    document.getElementById('history-section').style.display = 'none';
    document.getElementById('genre-bar').style.display = 'none';
    
    const title = type === 'tv' ? 'All Anime' : 'All Movies';
    const gridContainer = document.getElementById('main-grids');
    gridContainer.innerHTML = `<h2 class="section-title">${title}</h2><div id="filter-grid" class="poster-grid"></div>`;
    
    showSkeletons(['filter-grid']);

    // 3. Fetch from TMDB (Filtering by type and genre 16 for Anime hub consistency)
    let url = `${BASE_URL}/discover/${type}?sort_by=popularity.desc&with_genres=16`;
    if (type === 'movie') {
        url = `${BASE_URL}/discover/movie?sort_by=popularity.desc`; // More general for movies
    }

    const res = await fetch(url, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
    const data = await res.json();
    
    renderGrid(data.results, 'filter-grid');
}

async function filterByGenre(id, el) {
    // 1. UI Feedback: Highlight the selected circle
    document.querySelectorAll('.genre-circle-item').forEach(item => {
        item.style.background = '#222';
        item.style.borderColor = '#333';
    });
    el.style.background = '#333';
    el.style.borderColor = '#e50914';

    // 2. Prepare the view
    document.getElementById('hero-section').style.display = 'none';
    document.getElementById('history-section').style.display = 'none';
    const genreName = el.innerText.split('\n')[1] || "Filtered";
    const gridContainer = document.getElementById('main-grids');
    gridContainer.innerHTML = `<h2 class="section-title">${genreName} Results</h2><div id="genre-grid" class="poster-grid"></div>`;
    
    showSkeletons(['genre-grid']);

    // 3. Fetch data from TMDB for that specific genre
    const url = `${BASE_URL}/discover/tv?with_genres=${id}&with_original_language=ja&sort_by=popularity.desc`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
    const data = await res.json();
    
    renderGrid(data.results, 'genre-grid');
}

function renderFavorites() {
    const favorites = JSON.parse(localStorage.getItem('cineFavs')) || [];
    renderGrid(favorites, 'favorites-grid');
}

function debounceSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        searchContent();
    }, 300);
}

async function searchContent() {
    const query = document.getElementById('user-search').value;
    if (!query) {
        // If search bar is cleared, revert to home view and re-populate grids
        document.getElementById('main-grids').innerHTML = `
            <h2 class="section-title">🔥 Trending Anime</h2>
            <div id="anime-grid" class="poster-grid"></div>            
            <h2 class="section-title">🌸 Seasonal Favorites (Spring 2024)</h2>
            <div id="seasonal-grid" class="poster-grid"></div>
            <h2 class="section-title">🎬 Must Watch Movies</h2>
            <div id="movies-grid" class="poster-grid"></div>            
            <h2 class="section-title">🏆 Top Rated Masterpieces</h2>
            <div id="top-rated-grid" class="poster-grid"></div>
            <h2 class="section-title">🏢 Studio Spotlight</h2>
            <div id="studio-grid" class="poster-grid"></div>
        `;
        fetchCategory('anime', 'anime-grid');
        fetchCategory('seasonal', 'seasonal-grid');
        fetchCategory('movies', 'movies-grid');
        fetchCategory('studio', 'studio-grid');
        fetchCategory('cartoon', 'cartoon-grid');
        document.getElementById('history-section').style.display = 'block'; // Show history again
        document.getElementById('hero-section').style.display = 'flex'; // Show hero again
        document.getElementById('genre-bar').style.display = 'flex'; // Show genre bar again
        document.getElementById('main-grids').style.display = 'block'; // Ensure main-grids is visible
        return;
    }
    const res = await fetch(`${BASE_URL}/search/multi?query=${query}`, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
    const data = await res.json();
    
    // Update background to match top search result
    if (data.results && data.results.length > 0 && data.results[0].backdrop_path) {
        updateDynamicBackground(BACKDROP_PATH + data.results[0].backdrop_path);
    }

    document.getElementById('history-section').style.display = 'none';
    document.getElementById('hero-section').style.display = 'none';
    document.getElementById('genre-bar').style.display = 'none'; // Hide genre bar during search
    document.getElementById('main-grids').innerHTML = `
        <div style="display:flex; align-items:center; padding: 0 4%;">
            <button class="search-back-btn" onclick="clearSearch()">← Back to Home</button>
            <h2 class="section-title" style="margin:0; padding:0;">Search Results: ${query}</h2>
        </div>
        <div id="search-grid" class="poster-grid"></div>`;
    renderGrid(data.results, 'search-grid');
}

window.addEventListener('scroll', () => {
    const nav = document.querySelector('.top-nav');
    if (window.scrollY > 50) { // Adjust scroll threshold as needed
        nav.classList.add('scrolled');
    } else {
        nav.classList.remove('scrolled');
    }
});

// New Features (Appended at end per Prompt 4)
function updateDynamicBackground(imageUrl) {
    document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url(${imageUrl})`;
}

function closeInlinePlayer() {
    const container = document.getElementById('inline-player-container');
    const iframe = document.getElementById('inline-iframe');
    iframe.src = "";
    container.style.display = 'none';
    document.body.classList.remove('lights-out');
    document.body.classList.remove('modal-open');
}

function shareToWhatsApp() {
    const url = window.location.href;
    const text = `Check this out on CineStream: ${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

async function playNextEpisode() {
    if (currentE < maxE) {
        startPlayback(currentModalItem, currentS, currentE + 1);
    }
}

// Ported Jikan logic for better Anime Episode detection
async function fetchJikanEpisodes(title) {
    try {
        const searchRes = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`);
        const searchData = await searchRes.json();
        if (searchData.data && searchData.data.length > 0) {
            const malId = searchData.data[0].mal_id;
            const epRes = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes`);
            const epData = await epRes.json();
            return epData.data.length;
        }
    } catch (e) { console.error("Jikan Error:", e); }
    return null;
}

// Ad System Logic
function showVideoAd() {
    const adOverlay = document.getElementById('video-ad-overlay');
    const skipBtn = document.getElementById('skip-ad-btn');
    const timerText = document.getElementById('ad-timer-text');

    adOverlay.style.display = 'flex';
    adOverlay.style.cursor = 'pointer';
    
    // Reset UI state
    skipBtn.style.display = 'none';
    skipBtn.classList.remove('ready');
    timerText.innerText = "Click anywhere to support CineStream and watch video";
}

function handleAdClick() {
    // Replace this URL with your actual PopAds link
    const popAdsUrl = "https://www.highrevenuenetwork.com/your-id-here"; 
    window.open(popAdsUrl, '_blank');

    const adOverlay = document.getElementById('video-ad-overlay');
    const timerText = document.getElementById('ad-timer-text');
    const skipBtn = document.getElementById('skip-ad-btn');

    // Disable the click handler to prevent spamming tabs
    adOverlay.onclick = null;
    adOverlay.style.cursor = 'default';

    let timeLeft = 8;
    timerText.style.fontFamily = "'Orbitron', sans-serif";
    timerText.innerText = `Securing Server... [${timeLeft}]s`;

    const interval = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) {
            timerText.innerText = `Securing Server... [${timeLeft}]s`;
        } else {
            clearInterval(interval);
            timerText.innerText = "Ready to watch!";
            skipBtn.innerText = "Continue to Video ➡";
            skipBtn.style.display = 'block';
            skipBtn.classList.add('ready');
        }
    }, 1000);
}

function skipVideoAd() {
    const adOverlay = document.getElementById('video-ad-overlay');
    adOverlay.style.display = 'none';
}

/**
 * Detects if an ad-blocker is active by attempting to create an element
 * with classes typically targeted by ad-block filters.
 */
function detectAdBlock() {
    const adCheck = document.createElement('div');
    adCheck.innerHTML = '&nbsp;';
    adCheck.className = 'adsbox ad-placement ad-unit textads';
    adCheck.style.position = 'absolute';
    adCheck.style.left = '-9999px';
    document.body.appendChild(adCheck);

    window.setTimeout(() => {
        if (adCheck.offsetHeight === 0) {
            document.getElementById('adblock-modal').classList.add('show');
            startAdBlockTimer();
        }
        adCheck.remove();
    }, 100);
}

function startAdBlockTimer() {
    const btn = document.getElementById('adblock-continue-btn');
    let timeLeft = 10;

    const interval = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) {
            btn.innerText = `Wait ${timeLeft}s...`;
        } else {
            clearInterval(interval);
            btn.innerText = "Continue Anyway";
            btn.style.opacity = "1";
            btn.style.pointerEvents = "auto";
            btn.style.background = "#222";
        }
    }, 1000);
}

function closeAdBlockModal() {
    document.getElementById('adblock-modal').classList.remove('show');
}

function clearSearch() {
    document.getElementById('user-search').value = '';
    searchContent();
}

function downloadContent(item) {
    const type = (item.name || item.media_type === 'tv') ? 'tv' : 'movie';
    const url = type === 'tv' 
        ? `https://vidsrc.xyz/embed/tv?tmdb=${item.id}&season=${currentS}&episode=${currentE}`
        : `https://vidsrc.xyz/embed/movie?tmdb=${item.id}`;
    window.open(url, '_blank');
}

function downloadCurrentItem() {
    if(currentModalItem) downloadContent(currentModalItem);
}

// --- New Surgical Features ---

async function handleSearchDropdown(query) {
    const dropdown = document.getElementById('search-dropdown');
    if (query.length < 2) { dropdown.style.display = 'none'; return; }

    const res = await fetch(`${BASE_URL}/search/multi?query=${query}`, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
    const data = await res.json();
    
    if (data.results.length > 0) {
        dropdown.innerHTML = data.results.slice(0, 8).map(item => `
            <div class="search-result-item" onclick='handleSelection(${JSON.stringify(item).replace(/'/g, "&apos;")}); document.getElementById("search-dropdown").style.display="none";'>
                <img src="${item.poster_path ? IMG_PATH + item.poster_path : 'https://via.placeholder.com/40x60?text=?'}" alt="poster">
                <span>${item.name || item.title} (${(item.release_date || item.first_air_date || '').slice(0, 4)})</span>
            </div>
        `).join('');
        dropdown.style.display = 'block';
    } else {
        dropdown.style.display = 'none';
    }
}

function renderServerButtons() {
    const container = document.getElementById('server-list-buttons');
    if (!container) return;
    container.innerHTML = myServers.map((srv, idx) => {
        const isActive = idx === serverIdx ? 'active-server' : '';
        return `<button class="server-btn ${isActive}" onclick="switchSpecificServer(${idx})">${srv.name}</button>`;
    }).join('');
}

function switchSpecificServer(idx) {
    serverIdx = idx;
    if (currentPlaybackItem) {
        startPlayback(currentPlaybackItem, currentS, currentE);
    } else {
        updateServerIndicator();
    }
}

function cycleServers() {
    if (!currentPlaybackItem) return;
    serverIdx = (serverIdx + 1) % myServers.length;
    
    const btn = document.getElementById('smart-switch-btn');
    const originalText = btn.innerText;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> SWITCHING TO ${myServers[serverIdx].name}...`;
    
    startPlayback(currentPlaybackItem, currentS, currentE);
    
    setTimeout(() => { 
        btn.innerText = originalText;
        updateServerIndicator();
    }, 1500);
}

function updateServerIndicator() {
    const status = document.getElementById('server-status');
    if (status) {
        status.innerHTML = `ACTIVE SERVER: <span style="color: #e50914;">${myServers[serverIdx].name}</span> | <span style="color: #25D366;">STABLE</span>`;
    }
}

function showDataSaverTip(quality) {
    alert(`Data Saver Mode (${quality}):\n\nTo manually lower quality to ${quality}:\n1. Click the 'Settings' (gear icon) inside the video player.\n2. Select 'Quality'.\n3. Choose ${quality} or 'Auto'.\n\nThis helps save data on mobile connections!`);
}

function toggleDeveloperModal(show) {
    const modal = document.getElementById('developer-modal');
    if (show) {
        modal.innerHTML = `
            <div class="modal-content">
                <button class="modal-close" onclick="toggleDeveloperModal(false)">✕</button>
                <h2 style="font-family: 'Orbitron';">Eruaga Bryan</h2>
                <p style="color: #ccc; line-height: 1.6;">Role: <b>The Surgical Developer</b></p>
                <p style="color: #aaa;">Merging medical precision with high-end digital design.</p>

                <div class="support-card">
                    <h4 style="margin-top: 20px; margin-bottom: 10px;">Send a Secure Message</h4>
                    <a href="mailto:eruagabryan@gmail.com" class="copy-chip" style="text-decoration: none; color: inherit; display: inline-flex;">
                        <i class="fas fa-envelope"></i> <span>eruagabryan@gmail.com</span> <i class="fas fa-external-link-alt" style="font-size: 10px; margin-left: 5px;"></i>
                    </a>
                </div>

                <div class="support-card" style="margin-top: 15px; background: linear-gradient(135deg, rgba(0, 242, 255, 0.08) 0%, rgba(0, 0, 0, 0.9) 100%); border: 1px solid rgba(0, 242, 255, 0.3); padding: 15px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                    <h4 style="margin-bottom: 12px; color: #00f2ff; font-family: 'Orbitron'; letter-spacing: 1px;">PREMIUM SUPPORT</h4>
                    <p style="font-size: 11px; color: #888; margin-bottom: 10px; text-transform: uppercase;">Bank: PalmPay Limited (PalmPay)</p>
                    
                    <div class="copy-chip" onclick="copyText('JENNIFER ONOSHIOLEMAH ERUAGA', 'Account Name', this)" style="position: relative; cursor: pointer; display: inline-flex; align-items: center; color: #fff; margin-bottom: 10px; font-size: 12px; background: rgba(255,255,255,0.05); padding: 6px 10px; border-radius: 6px; width: 100%; box-sizing: border-box;">
                        <i class="fas fa-user" style="color: #00f2ff;"></i> <span style="margin-left: 10px;"><b>JENNIFER ONOSHIOLEMAH ERUAGA</b></span> <i class="fas fa-copy" style="font-size: 10px; margin-left: auto; opacity: 0.5;"></i>
                        <span class="tooltip-text" style="visibility: hidden; background-color: #00f2ff; color: #000; text-align: center; border-radius: 4px; padding: 2px 8px; position: absolute; z-index: 1; bottom: 125%; left: 50%; transform: translateX(-50%); font-size: 10px; font-weight: bold;">Copied!</span>
                    </div>
                    
                    <div class="copy-chip" onclick="copyText('7049581015', 'PalmPay Number', this)" style="position: relative; cursor: pointer; display: inline-flex; align-items: center; color: #fff; font-size: 16px; background: rgba(0, 242, 255, 0.1); padding: 8px 10px; border-radius: 6px; width: 100%; box-sizing: border-box;">
                        <i class="fas fa-wallet" style="color: #00f2ff;"></i> <span style="margin-left: 10px; font-family: 'Orbitron';">704 958 1015</span> <i class="fas fa-copy" style="font-size: 12px; margin-left: auto; opacity: 0.7;"></i>
                        <span class="tooltip-text" style="visibility: hidden; background-color: #00f2ff; color: #000; text-align: center; border-radius: 4px; padding: 2px 8px; position: absolute; z-index: 1; bottom: 125%; left: 50%; transform: translateX(-50%); font-size: 10px; font-weight: bold;">Copied!</span>
                    </div>
                    
                    <p style="color: #555; font-size: 9px; margin-top: 10px; text-align: center; font-style: italic;">Tap to copy details for a surgical contribution</p>
                </div>
                <button class="play-btn" style="margin-top:20px; width:100%;" onclick="toggleDeveloperModal(false)">Close</button>
            </div>
        `;
        modal.classList.add('show');
    } else {
        modal.classList.remove('show');
    }
}

function copyText(text, label, el) {
    navigator.clipboard.writeText(text).then(() => {
        const tooltip = el.querySelector('.tooltip-text');
        if (tooltip) {
            tooltip.style.visibility = 'visible';
            setTimeout(() => {
                tooltip.style.visibility = 'hidden';
            }, 1500);
        }
    });
}

// Close dropdown when clicking outside
window.addEventListener('click', (e) => {
    if (!document.querySelector('.search-container').contains(e.target)) {
        document.getElementById('search-dropdown').style.display = 'none';
    }
});