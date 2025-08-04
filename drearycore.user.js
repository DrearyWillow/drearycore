// ==UserScript==
// @name         drearycore
// @namespace    https://github.com/DrearyWillow
// @version      0.0.5
// @description  extracts urls from bluesky alt text and displays as clickable chips
// @author       drearywillow
// @icon         https://dreary.dev/bsky/light-pink.png
// @updateURL    https://github.com/DrearyWillow/drearycore/raw/main/drearycore.user.js
// @downloadURL  https://github.com/DrearyWillow/drearycore/raw/main/drearycore.user.js
// @grant        none
// @match        https://bsky.app/*
// @match        https://main.bsky.dev/*
// @match        https://deer.social/*
// @match        https://zeppelin.social/*
// @match        https://smol.life/*
// ==/UserScript==

(function () {
    'use strict';

    // user-defined handles to watch. if left blank, all handles are watched.
    const WATCHED_HANDLES = [
        // "dreary.dev",
        // "alice-roberts.bsky.social"
    ];

    function injectChipsCSS() {
        const cssText = `
.willow__chips-container {
  display: flex;
  flex-flow: wrap;
  gap: 0.25rem;
  margin-top: 0.5rem;
}

.willow__chip {
  display: inline-block;
  padding: 0.35rem 0.5rem;
  background-color: rgb(30, 41, 54);
  border-radius: 9999px;
  border: none;
  transition: background-color 0.2s ease;
  text-decoration: none;
  color: rgb(147, 165, 183);
  font-size: 0.75rem;
  letter-spacing: 0.25px;
  font-weight: 500;
  line-height: 0.9375rem;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
}

.willow__chip:hover {
  background-color: rgb(30, 53, 68);
  text-decoration: none;
}
    `;
        const style = document.createElement("style");
        style.textContent = cssText;
        document.head.appendChild(style);
    }

    function createChipsContainer(urls) {
        const container = document.createElement("div");
        container.className = "willow__chips-container";

        const urlsByHostname = urls.reduce((acc, url) => {
            const hostname = new URL(url).hostname;
            (acc[hostname] ??= []).push(url);
            return acc;
        }, {});

        Object.entries(urlsByHostname).forEach(([hostname, urls]) => {
            urls.forEach(url => {
                const pathname = new URL(url).pathname;
                try {
                    const chip = document.createElement("a");
                    chip.className = "willow__chip";
                    chip.href = url;
                    chip.target = "_blank";
                    chip.rel = "noopener noreferrer";
                    chip.textContent = urls.length === 1 ? hostname : `${hostname}${pathname}`;
                    chip.addEventListener("click", e => e.stopPropagation());
                    container.appendChild(chip);
                } catch (e) { }
            });
        });

        return container;
    }

    function insertChips(el, urls, insertionPoint) {
        const chipsContainer = createChipsContainer(urls);

        while (
            insertionPoint?.parentElement?.children.length === 1 &&
                insertionPoint.parentElement.parentElement ||
            insertionPoint?.parentElement?.style?.flexDirection === "row"
        ) {
            insertionPoint = insertionPoint.parentElement;
        }

        if (insertionPoint) {
            insertionPoint.insertAdjacentElement("afterend", chipsContainer);
            el.dataset.chipsInjected = "true";
        }
    }

    function extractUrlsFromAlt(alt) {
        const urlRegex = /https?:\/\/[^\s]+/g;
        return alt.match(urlRegex) || [];
    }

    function isNotQuote(media, el) {
        const quoteContainer = media.closest('div[aria-label^="Post by "]');
        return !quoteContainer || quoteContainer === el;
    }

    function lazyLoadElement(media, el, fn) {
        const observer = new MutationObserver(() => {
            fn(el);
            observer.disconnect();
        });
        observer.observe(media, { attributes: true, childList: true, subtree: true });
    }

    function processVideoElement(el) {
        if (el.dataset.chipsInjected === "true") return;

        const videoContainer = [...el.querySelectorAll(
            'div[aria-label="Embedded video player"]'
        )].find(vid => isNotQuote(vid, el));

        if (!videoContainer) {
            if (el.querySelector("div[style*='top: calc(50% - 50vh)']")) {
                lazyLoadElement(el, el, processVideoElement);
            }
            return;
        }

        const altText = videoContainer.querySelector('figcaption')?.textContent;
        if (!altText) return;

        const urls = [...new Set(extractUrlsFromAlt(altText))];
        if (urls.length === 0) return;

        insertChips(el, urls, videoContainer?.parentElement);
    }

    function processGIFElement(el) {
        if (el.dataset.chipsInjected === "true") return;

        const gif = [...el.querySelectorAll(
            'video[src^="https://t.gifs.bsky.app/"][aria-label]'
        )].find(g => isNotQuote(g, el));
        if (!gif) return;

        const altText = gif.getAttribute("aria-label");
        if (!altText) return;

        const urls = [...new Set(extractUrlsFromAlt(altText))];
        if (urls.length === 0) return;

        insertChips(el, urls, gif?.parentElement);
    }

    function processImageElement(el) {
        if (el.dataset.chipsInjected === "true") return;

        const thumbnailImgs = [...el.querySelectorAll(
            'img[src*="feed_thumbnail"][alt]'
        )].filter(img => isNotQuote(img, el));

        if (thumbnailImgs.length === 0) {
            const container = el.querySelector("div[data-expoimage='true']");
            if (container) lazyLoadElement(container, el, processImageElement);
            return;
        }

        const urls = [...new Set(thumbnailImgs.flatMap(img => extractUrlsFromAlt(img.alt)))];
        if (urls.length === 0) return;
        const lastUrl = urls[urls.length-1];

        let imageContainer = null;
        for (const thumbnailImg of thumbnailImgs) {
            imageContainer = thumbnailImg.closest(`div[aria-label*="${lastUrl}"]`) ??
                thumbnailImg.closest(`button[aria-label*="${lastUrl}"]`)?.parentElement?.parentElement?.parentElement;
            if (imageContainer) break;
        }

        insertChips(el, urls, imageContainer);
    }

    function processPostElement(el) {
        if (el.dataset.chipsInjected === "true") return;

        if (WATCHED_HANDLES.length !== 0) {
            const handle =
                (el.getAttribute("data-testid")?.match(/by-(.+)/)?.[1]) ??
                (el.getAttribute("aria-label")?.match(/Post by (.+)/)?.[1]);

            if (!handle || !WATCHED_HANDLES.includes(handle)) return;
        }

        processGIFElement(el);
        processImageElement(el);
        processVideoElement(el);
    }

    function scanForPosts(el) {
        const posts = el.querySelectorAll(
            'div[data-testid^="feedItem-by-"], ' +
            'div[data-testid^="postThreadItem-by-"], ' +
            'div[aria-label^="Post by "]'
        );
        posts.forEach(processPostElement);
    }

    function initialize() {
        injectChipsCSS();

        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node;

                        const testId = element.getAttribute("data-testid");
                        if (testId && (testId.startsWith("feedItem-by-") || testId.startsWith("postThreadItem-by-"))) {
                            processPostElement(element);
                        }

                        scanForPosts(element);
                    }
                });
            });
        });
        observer.observe(document.body, { attributes: true, childList: true, subtree: true });

        scanForPosts(document);
    }

    if (document.readyState === "complete") {
        initialize();
    } else {
        document.addEventListener("readystatechange", () => {
            if (document.readyState === "complete") {
                initialize();
            }
        });
    }

})();

