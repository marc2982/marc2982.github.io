export function excelRank(values, target) {
    const sortedValues = [...values].sort((a, b) => b - a);
    for (let i = 0; i < sortedValues.length; i++) {
        if (sortedValues[i] === target) {
            return i + 1;
        }
    }
    throw new Error("cant calculate excel ranking");
}
