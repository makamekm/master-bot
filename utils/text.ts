export function isFirstLetterUppercase(str: String) {
    if (!str || str.length === 0) return false;
    return str.charAt(0) === str.charAt(0).toUpperCase();
}