// ===== File Type Definitions =====
const FILE_TYPES = {
  images: {
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico', '.tiff', '.tif'],
    badge: 'image',
    label: 'IMG'
  },
  videos: {
    extensions: ['.mp4', '.webm', '.avi', '.mkv', '.mov', '.flv', '.wmv', '.m4v', '.3gp', '.ogv'],
    badge: 'video',
    label: 'VID'
  },
  audio: {
    extensions: ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.wma', '.m4a', '.opus'],
    badge: 'audio',
    label: 'AUD'
  },
  documents: {
    extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.rtf', '.odt', '.ods'],
    badge: 'document',
    label: 'DOC'
  },
  archives: {
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz', '.tar.gz'],
    badge: 'archive',
    label: 'ZIP'
  },
  executables: {
    extensions: ['.exe', '.msi', '.dmg', '.deb', '.rpm', '.appimage', '.app', '.bat', '.sh'],
    badge: 'executable',
    label: 'EXE'
  }
};

let allLinks = [];
let filteredLinks = [];

// ===== DOM Elements =====
const elements = {
  extractBtn: document.getElementById('extractBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  filterType: document.getElementById('filterType'),
  customFilterGroup: document.getElementById('customFilterGroup'),
  customExtension: document.getElementById('customExtension'),
  searchInput: document.getElementById('searchInput'),
  stats: document.getElementById('stats'),
  totalCount: document.getElementById('totalCount'),
  filteredCount: document.getElementById('filteredCount'),
  actions: document.getElementById('actions'),
  selectAll: document.getElementById('selectAll'),
  copySelectedBtn: document.getElementById('copySelectedBtn'),
  copyAllBtn: document.getElementById('copyAllBtn'),
  downloadSelectedBtn: document.getElementById('downloadSelectedBtn'),
  exportBtn: document.getElementById('exportBtn'),
  linksContainer: document.getElementById('linksContainer'),
  linksList: document.getElementById('linksList'),
  emptyState: document.getElementById('emptyState'),
  statusBar: document.getElementById('statusBar')
};

// ===== Event Listeners =====
elements.extractBtn.addEventListener('click', extractLinks);
elements.refreshBtn.addEventListener('click', extractLinks);
elements.filterType.addEventListener('change', onFilterChange);
elements.customExtension.addEventListener('input', applyFilters);
elements.searchInput.addEventListener('input', applyFilters);
elements.selectAll.addEventListener('change', toggleSelectAll);
elements.copySelectedBtn.addEventListener('click', copySelected);
elements.copyAllBtn.addEventListener('click', copyAll);
elements.downloadSelectedBtn.addEventListener('click', downloadSelected);
elements.exportBtn.addEventListener('click', exportAsTxt);

// ===== Filter Change Handler =====
function onFilterChange() {
  const value = elements.filterType.value;
  elements.customFilterGroup.style.display = value === 'custom' ? 'block' : 'none';
  applyFilters();
}

// ===== Extract Links =====
async function extractLinks() {
  showLoading();
  setStatus('Scanning page...', '');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Inject content script if needed and get links
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scanPageForLinks
    });

    if (results && results[0] && results[0].result) {
      allLinks = deduplicateLinks(results[0].result);
      applyFilters();
      setStatus(`✅ Found ${allLinks.length} unique links`, 'success');
    } else {
      allLinks = [];
      applyFilters();
      setStatus('⚠️ No links found on this page', 'error');
    }
  } catch (error) {
    console.error('Extraction error:', error);
    setStatus(`❌ Error: ${error.message}`, 'error');
    showEmpty('Failed to scan page. Try refreshing the page.');
  }
}

// ===== Page Scanner Function (injected into page) =====
function scanPageForLinks() {
  const links = new Set();
  const results = [];

  // Helper to extract and validate URL
  function addLink(url, source) {
    if (!url) return;
    url = url.trim();

    // Skip javascript:, mailto:, data: (except small ones), empty anchors
    if (url.startsWith('javascript:') || url.startsWith('mailto:') || url === '#' || url === '') return;

    // Handle relative URLs
    try {
      const absoluteUrl = new URL(url, document.baseURI).href;
      if (links.has(absoluteUrl)) return;
      links.add(absoluteUrl);
      results.push({ url: absoluteUrl, source });
    } catch (e) {
      // Invalid URL
    }
  }

  // 1. All <a> tags
  document.querySelectorAll('a[href]').forEach(a => {
    addLink(a.href, 'anchor');
  });

  // 2. All <img> tags
  document.querySelectorAll('img[src]').forEach(img => {
    addLink(img.src, 'image');
    if (img.dataset.src) addLink(img.dataset.src, 'image-lazy');
    if (img.dataset.original) addLink(img.dataset.original, 'image-lazy');
  });

  // 3. All <source> tags (video/audio)
  document.querySelectorAll('source[src]').forEach(source => {
    addLink(source.src, 'media-source');
  });

  // 4. All <video> tags
  document.querySelectorAll('video[src]').forEach(video => {
    addLink(video.src, 'video');
  });
  document.querySelectorAll('video source[src]').forEach(source => {
    addLink(source.src, 'video-source');
  });

  // 5. All <audio> tags
  document.querySelectorAll('audio[src]').forEach(audio => {
    addLink(audio.src, 'audio');
  });

  // 6. All <embed> and <object> tags
  document.querySelectorAll('embed[src]').forEach(embed => {
    addLink(embed.src, 'embed');
  });
  document.querySelectorAll('object[data]').forEach(obj => {
    addLink(obj.data, 'object');
  });

  // 7. All <iframe> tags
  document.querySelectorAll('iframe[src]').forEach(iframe => {
    addLink(iframe.src, 'iframe');
  });

  // 8. All <link> tags (stylesheets, icons, etc.)
  document.querySelectorAll('link[href]').forEach(link => {
    addLink(link.href, 'link-tag');
  });

  // 9. All <script> tags
  document.querySelectorAll('script[src]').forEach(script => {
    addLink(script.src, 'script');
  });

  // 10. Background images in style attributes
  document.querySelectorAll('[style*="url"]').forEach(el => {
    const matches = el.style.cssText.match(/url\(['"]?(.*?)['"]?\)/g);
    if (matches) {
      matches.forEach(match => {
        const url = match.replace(/url\(['"]?/, '').replace(/['"]?\)/, '');
        addLink(url, 'css-bg');
      });
    }
  });

  // 11. Scan srcset attributes
  document.querySelectorAll('[srcset]').forEach(el => {
    const srcset = el.getAttribute('srcset');
    srcset.split(',').forEach(entry => {
      const url = entry.trim().split(/\s+/)[0];
      addLink(url, 'srcset');
    });
  });

  // 12. data-href, data-url, data-download attributes
  document.querySelectorAll('[data-href], [data-url], [data-download]').forEach(el => {
    addLink(el.dataset.href, 'data-attr');
    addLink(el.dataset.url, 'data-attr');
    addLink(el.dataset.download, 'data-attr');
  });

  return results;
}

// ===== Deduplicate =====
function deduplicateLinks(links) {
  const seen = new Set();
  return links.filter(link => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

// ===== Get File Type =====
function getFileType(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    for (const [type, config] of Object.entries(FILE_TYPES)) {
      if (config.extensions.some(ext => pathname.endsWith(ext))) {
        return { type, ...config };
      }
    }
  } catch (e) {}
  return { type: 'other', badge: 'other', label: 'LINK', extensions: [] };
}

// ===== Get Filename =====
function getFilename(url) {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/');
    const last = parts[parts.length - 1];
    return decodeURIComponent(last) || url;
  } catch (e) {
    return url;
  }
}

// ===== Apply Filters =====
function applyFilters() {
  const filterType = elements.filterType.value;
  const searchQuery = elements.searchInput.value.toLowerCase().trim();
  const customExt = elements.customExtension.value.trim().toLowerCase();

  filteredLinks = allLinks.filter(link => {
    const url = link.url.toLowerCase();
    const filename = getFilename(link.url).toLowerCase();

    // Type filter
    if (filterType !== 'all' && filterType !== 'custom') {
      const config = FILE_TYPES[filterType];
      if (config) {
        const matchesType = config.extensions.some(ext => {
          try {
            return new URL(link.url).pathname.toLowerCase().endsWith(ext);
          } catch { return false; }
        });
        if (!matchesType) return false;
      }
    }

    // Custom extension filter
    if (filterType === 'custom' && customExt) {
      const extensions = customExt.split(',').map(e => {
        e = e.trim();
        return e.startsWith('.') ? e : '.' + e;
      });
      const matchesCustom = extensions.some(ext => {
        try {
          return new URL(link.url).pathname.toLowerCase().endsWith(ext);
        } catch { return false; }
      });
      if (!matchesCustom) return false;
    }

    // Search filter
    if (searchQuery) {
      return url.includes(searchQuery) || filename.includes(searchQuery);
    }

    return true;
  });

  renderLinks();
  updateStats();
}

// ===== Render Links =====
function renderLinks() {
  elements.linksList.innerHTML = '';

  if (filteredLinks.length === 0) {
    showEmpty(allLinks.length > 0 ? 'No links match the current filter' : 'Click "Extract Links" to scan the current page');
    elements.actions.style.display = 'none';
    return;
  }

  elements.emptyState.style.display = 'none';
  elements.actions.style.display = 'flex';
  elements.stats.style.display = 'flex';

  filteredLinks.forEach((link, index) => {
    const fileType = getFileType(link.url);
    const filename = getFilename(link.url);

    const li = document.createElement('li');
    li.className = 'link-item';
    li.innerHTML = `
      <input type="checkbox" class="link-checkbox" data-index="${index}">
      <div class="link-info">
        <div class="link-filename" title="${filename}">${truncate(filename, 60)}</div>
        <a href="${escapeHtml(link.url)}" class="link-url" target="_blank" title="${escapeHtml(link.url)}">${truncate(link.url, 80)}</a>
        <span class="link-badge badge-${fileType.badge}">${fileType.label}</span>
      </div>
      <div class="link-actions">
        <button class="link-action-btn copy-btn" data-url="${escapeAttr(link.url)}" title="Copy URL">📋</button>
        <button class="link-action-btn download-btn" data-url="${escapeAttr(link.url)}" data-filename="${escapeAttr(filename)}" title="Download">⬇️</button>
      </div>
    `;

    elements.linksList.appendChild(li);
  });

  // Add event listeners for individual buttons
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = e.target.dataset.url;
      copyToClipboard(url);
      setStatus('📋 URL copied to clipboard!', 'success');
    });
  });

  document.querySelectorAll('.download-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = e.target.dataset.url;
      const filename = e.target.dataset.filename;
      chrome.downloads.download({ url, filename: filename || undefined });
      setStatus(`⬇️ Downloading: ${filename}`, 'success');
    });
  });
}

// ===== Update Stats =====
function updateStats() {
  elements.stats.style.display = 'flex';
  elements.totalCount.textContent = `${allLinks.length} total links`;
  elements.filteredCount.textContent = filteredLinks.length !== allLinks.length
    ? `${filteredLinks.length} shown`
    : '';
}

// ===== Select All =====
function toggleSelectAll() {
  const checked = elements.selectAll.checked;
  document.querySelectorAll('.link-checkbox').forEach(cb => {
    cb.checked = checked;
  });
}

// ===== Get Selected URLs =====
function getSelectedUrls() {
  const urls = [];
  document.querySelectorAll('.link-checkbox:checked').forEach(cb => {
    const index = parseInt(cb.dataset.index);
    if (filteredLinks[index]) {
      urls.push(filteredLinks[index].url);
    }
  });
  return urls;
}

// ===== Copy Selected =====
function copySelected() {
  const urls = getSelectedUrls();
  if (urls.length === 0) {
    setStatus('⚠️ No links selected', 'error');
    return;
  }
  copyToClipboard(urls.join('\n'));
  setStatus(`📋 ${urls.length} URLs copied to clipboard!`, 'success');
}

// ===== Copy All =====
function copyAll() {
  if (filteredLinks.length === 0) {
    setStatus('⚠️ No links to copy', 'error');
    return;
  }
  const urls = filteredLinks.map(l => l.url).join('\n');
  copyToClipboard(urls);
  setStatus(`📋 ${filteredLinks.length} URLs copied to clipboard!`, 'success');
}

// ===== Download Selected =====
function downloadSelected() {
  const urls = getSelectedUrls();
  if (urls.length === 0) {
    setStatus('⚠️ No links selected', 'error');
    return;
  }

  if (urls.length > 10) {
    if (!confirm(`You are about to download ${urls.length} files. Continue?`)) return;
  }

  urls.forEach(url => {
    const filename = getFilename(url);
    chrome.downloads.download({ url, filename: filename || undefined });
  });
  setStatus(`⬇️ Downloading ${urls.length} files...`, 'success');
}

// ===== Export as TXT =====
function exportAsTxt() {
  if (filteredLinks.length === 0) {
    setStatus('⚠️ No links to export', 'error');
    return;
  }

  const content = filteredLinks.map(l => l.url).join('\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().slice(0, 10);

  chrome.downloads.download({
    url,
    filename: `extracted-links-${timestamp}.txt`,
    saveAs: true
  });

  setStatus(`💾 Exported ${filteredLinks.length} links`, 'success');
}

// ===== Utility Functions =====
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  });
}

function setStatus(message, type) {
  elements.statusBar.textContent = message;
  elements.statusBar.className = 'status-bar' + (type ? ' ' + type : '');

  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      elements.statusBar.textContent = '';
      elements.statusBar.className = 'status-bar';
    }, 4000);
  }
}

function showLoading() {
  elements.emptyState.style.display = 'none';
  elements.linksList.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      Scanning page for links...
    </div>
  `;
}

function showEmpty(message) {
  elements.linksList.innerHTML = '';
  elements.emptyState.style.display = 'flex';
  elements.emptyState.querySelector('p').textContent = message;
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}