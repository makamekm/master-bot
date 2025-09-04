export function encodeJSON(value: any) {
    try {
        return JSON.stringify(value);
    } catch (error) {
        return '{}';
    }
}

export function decodeJSON<T = any>(value: string): T {
    try {
        return JSON.parse(value);
    } catch (error) {
        return {} as any;
    }
}
