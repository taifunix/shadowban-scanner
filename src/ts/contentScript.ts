const HANDLE_ANCHOR_CHECKED_ATTRIBUTE = "data-sb-sorsa-score-checked";
const HANDLE_SCORE_ATTRIBUTE = "data-sb-sorsa-score";

const handleScoreCache = new Map<string, Promise<number | null>>();

const escapeForRegex = (value: string): string => {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
};

const fetchSorsaScore = async (handle: string): Promise<number | null> => {
    const normalizedHandle = handle.toLowerCase();
    const cachedResult = handleScoreCache.get(normalizedHandle);
    if (cachedResult) {
        return cachedResult;
    }

    const fetchPromise = (async () => {
        const response = await fetch(`https://app.sorsa.io/profile/${encodeURIComponent(handle)}`);
        if (!response.ok) {
            return null;
        }

        const html = await response.text();
        const escapedHandle = escapeForRegex(handle);
        const exactMatchRegex = new RegExp(
            `\\\\"screen_name\\\\":\\\\"${escapedHandle}\\\\"[\\s\\S]{0,1200}?\\\\"score_value\\\\":([0-9.]+)`,
            "iu"
        );
        const exactMatch = exactMatchRegex.exec(html);
        if (exactMatch?.[1]) {
            return Math.round(Number.parseFloat(exactMatch[1]));
        }

        const fallbackMatch = /\\"score_value\\":([0-9.]+)/u.exec(html);
        if (!fallbackMatch?.[1]) {
            return null;
        }

        return Math.round(Number.parseFloat(fallbackMatch[1]));
    })().catch(() => null);

    handleScoreCache.set(normalizedHandle, fetchPromise);
    return fetchPromise;
};

const tryExtractHandle = (anchor: HTMLAnchorElement): null | string => {
    const anchorText = anchor.textContent?.trim();
    if (!anchorText?.startsWith("@")) {
        return null;
    }

    const url = new URL(anchor.href);
    const pathSegments = url.pathname.split("/").filter(Boolean);
    if (pathSegments.length !== 1) {
        return null;
    }

    const [handle] = pathSegments;
    if (!handle) {
        return null;
    }

    if (anchorText.toLowerCase() !== `@${handle.toLowerCase()}`) {
        return null;
    }

    return handle;
};

const addScoreToAnchor = async (anchor: HTMLAnchorElement): Promise<void> => {
    if (anchor.hasAttribute(HANDLE_SCORE_ATTRIBUTE)) {
        return;
    }

    const handle = tryExtractHandle(anchor);
    if (!handle) {
        return;
    }

    const score = await fetchSorsaScore(handle);
    if (score === null || !anchor.isConnected) {
        return;
    }

    if (anchor.nextElementSibling?.classList.contains("shadowban-scanner-sorsa-score")) {
        anchor.setAttribute(HANDLE_SCORE_ATTRIBUTE, "true");
        return;
    }

    const scoreElement = document.createElement("span");
    scoreElement.classList.add("shadowban-scanner-sorsa-score");
    scoreElement.textContent = String(score);
    anchor.insertAdjacentElement("afterend", scoreElement);
    anchor.setAttribute(HANDLE_SCORE_ATTRIBUTE, "true");
};

const updateHandleScores = (): void => {
    const anchors = document.querySelectorAll<HTMLAnchorElement>(
        `a[href^='/']:not([${HANDLE_ANCHOR_CHECKED_ATTRIBUTE}])`
    );

    for (const anchor of anchors) {
        anchor.setAttribute(HANDLE_ANCHOR_CHECKED_ATTRIBUTE, "true");
        void addScoreToAnchor(anchor);
    }
};

const observeHandleScores = (): void => {
    updateHandleScores();

    const observer = new MutationObserver(() => {
        updateHandleScores();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
};

observeHandleScores();
