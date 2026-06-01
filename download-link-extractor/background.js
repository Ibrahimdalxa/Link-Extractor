// Background service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('Download Link Extractor installed successfully!');
});

// Handle download errors gracefully
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.error) {
    console.warn('Download error:', delta.error.current);
  }
});