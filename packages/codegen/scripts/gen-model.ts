import * as fs from 'fs';
import * as path from 'path';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export function generateTsModel(jsonData: JsonValue[], typeName = 'Root'): string {
    if (!Array.isArray(jsonData) || jsonData.length === 0) {
        throw new Error('Input must be a non-empty array of JSON objects.');
    }

    const mergeObjects = (objects: Record<string, JsonValue>[]): Record<string, JsonValue> => {
        return objects.reduce((acc, obj) => {
            for (const key in obj) {
                if (!acc[key]) {
                    acc[key] = obj[key];
                } else {
                    acc[key] = mergeTypes(acc[key], obj[key]);
                }
            }
            return acc;
        }, {} as Record<string, JsonValue>);
    };

    const mergeTypes = (a: JsonValue, b: JsonValue): JsonValue => {
        if (a === null || b === null) return null; // Allow null values
        if (typeof a !== typeof b) return null; // Fallback to `any` if types mismatch
        if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
        if (typeof a === 'object' && typeof b === 'object') return mergeObjects([a as Record<string, JsonValue>, b as Record<string, JsonValue>]);
        return a;
    };

    const getType = (value: JsonValue): string => {
        if (value === null) return 'null';
        if (Array.isArray(value)) {
            const types = Array.from(new Set(value.map(getType)));
            return types.length === 1 ? `${types[0]}[]` : 'any[]';
        }
        if (typeof value === 'object') return 'object';
        return typeof value;
    };

    const generateInterface = (name: string, obj: Record<string, JsonValue>, optionalKeys: Set<string>): string => {
        const fields = Object.entries(obj)
            .map(([key, value]) => {
                const isOptional = optionalKeys.has(key);
                const type = Array.isArray(value)
                    ? getType(value)
                    : typeof value === 'object' && value !== null
                        ? `${capitalize(key)}`
                        : getType(value);
                return `  ${key}${isOptional ? '?' : ''}: ${type};`;
            })
            .join('\n');

        return `export interface ${name} {\n${fields}\n}`;
    };

    const capitalize = (str: string): string => str.charAt(0).toUpperCase() + str.slice(1);

    const findOptionalKeys = (objects: Record<string, JsonValue>[]): Set<string> => {
        const allKeys = new Set(objects.flatMap(obj => Object.keys(obj)));
        const optionalKeys = new Set<string>();

        allKeys.forEach(key => {
            const isOptional = objects.some(obj => !(key in obj) || obj[key] === null);
            if (isOptional) optionalKeys.add(key);
        });

        return optionalKeys;
    };

    const mergedObject = mergeObjects(jsonData as Record<string, JsonValue>[]);
    const optionalKeys = findOptionalKeys(jsonData as Record<string, JsonValue>[]);
    const mainInterface = generateInterface(typeName, mergedObject, optionalKeys);

    const nestedInterfaces = Object.entries(mergedObject)
        .filter(([, value]) => typeof value === 'object' && value !== null && !Array.isArray(value))
        .map(([key, value]) => generateInterface(capitalize(key), value as Record<string, JsonValue>, findOptionalKeys([value as Record<string, JsonValue>])))
        .join('\n\n');

    return `${nestedInterfaces}\n\n${mainInterface}`;
}

function processFile(filePath: string, outputDir: string): void {
    const content = fs.readFileSync(filePath, 'utf-8');
    const jsonData = JSON.parse(content);
    if (!Array.isArray(jsonData)) {
        throw new Error(`File ${filePath} does not contain a JSON array.`);
    }

    const typeName = path.basename(filePath, path.extname(filePath));
    const tsModel = generateTsModel(jsonData, capitalize(typeName));
    const outputFilePath = path.join(outputDir, `${typeName}.ts`);

    fs.writeFileSync(outputFilePath, tsModel, 'utf-8');
    console.log(`Generated TypeScript model for ${filePath} at ${outputFilePath}`);
}

function processDirectory(directoryPath: string, outputDir: string): void {
    const files = fs.readdirSync(directoryPath);
    const allJsonData: Record<string, JsonValue>[] = [];

    files.forEach(file => {
        const fullPath = path.join(directoryPath, file);
        if (fs.statSync(fullPath).isFile() && file.endsWith('.json')) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const jsonData = JSON.parse(content);
            allJsonData.push(jsonData);
        }
    });

    if (allJsonData.length === 0) {
        throw new Error(`No valid JSON array data found in directory ${directoryPath}.`);
    }

    const typeName = capitalize(path.basename(directoryPath));
    const tsModel = generateTsModel(allJsonData, typeName);
    const outputFilePath = path.join(outputDir, `${typeName}.ts`);

    fs.writeFileSync(outputFilePath, tsModel, 'utf-8');
    console.log(`Generated TypeScript model for directory ${directoryPath} at ${outputFilePath}`);
}

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Main script logic
const inputPath = process.argv[2];
const outputDir = process.argv[3];

if (!inputPath || !outputDir) {
    console.error('Usage: node gen-model.js <input-file-or-directory> <output-directory>');
    process.exit(1);
}

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const stats = fs.statSync(inputPath);

if (stats.isFile()) {
    processFile(inputPath, outputDir);
} else if (stats.isDirectory()) {
    processDirectory(inputPath, outputDir);
} else {
    console.error('Input path must be a file or directory.');
    process.exit(1);
}
