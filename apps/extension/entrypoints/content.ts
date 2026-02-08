export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "GET_PAGE_CONTENT") {
        sendResponse({
          url: window.location.href,
          title: document.title,
          html: document.documentElement.outerHTML,
        })
      }
      return true
    })
  },
})
