function unixSecondsToDate(seconds) {
    if (!seconds) return null;
    return new Date(seconds * 1000);
}

function genOption(key) {
    return `${String(key).length > 1 ? "--" : "-"}${key}`;
}

export { unixSecondsToDate, genOption };