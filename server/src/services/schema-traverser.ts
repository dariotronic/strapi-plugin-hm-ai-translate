import type { Core } from '@strapi/strapi';

export type Segment = {
    path: (string | number)[];
    text: string;
    meta: {
        fieldType: string;
        uid: string;
        maxLength?: number; // vincolo maxLength dello schema, se presente
    };
};

export class SchemaTraverser {
    private strapi: Core.Strapi;

    constructor(strapi: Core.Strapi) {
        this.strapi = strapi;
    }

    /**
     * Generates a flat array of segments containing translatable text from the input data based on the schema.
     */
    public extract(uid: string, data: any): Segment[] {
        const segments: Segment[] = [];
        const schema = this.getSchema(uid);
        if (!schema) return segments;

        this.traverseForExtract(schema, data, [], segments, uid);
        return segments;
    }

    /**
     * Returns a deeply cloned data object where the text segments have been replaced with their translated counterparts.
     */
    public apply(uid: string, originalData: any, translatedSegments: Segment[]): any {
        const clonedData = JSON.parse(JSON.stringify(originalData));
        for (const segment of translatedSegments) {
            if (!segment.path || segment.path.length === 0) continue;
            this.setValueAtPath(clonedData, segment.path, segment.text);
        }
        return clonedData;
    }

    private getSchema(uid: string) {
        if (this.strapi.contentTypes[uid]) {
            return this.strapi.contentTypes[uid];
        }
        if (this.strapi.components[uid]) {
            return this.strapi.components[uid];
        }
        return null;
    }

    private traverseForExtract(schema: any, data: any, currentPath: (string | number)[], segments: Segment[], uid: string) {
        if (!data || typeof data !== 'object') return;

        const attributes = schema.attributes;
        if (!attributes) return;

        for (const key of Object.keys(data)) {
            const attribute = attributes[key];
            const value = data[key];

            if (!attribute || value == null) continue;

            const newPath = [...currentPath, key];

            // Base cases for translatable types
            if (['string', 'text', 'richtext'].includes(attribute.type)) {
                if (typeof value === 'string' && value.trim() !== '') {
                    segments.push({
                        path: newPath,
                        text: value,
                        meta: {
                            fieldType: attribute.type,
                            uid,
                            // Cattura il vincolo maxLength per poter troncare il testo tradotto
                            maxLength: attribute.maxLength ?? undefined,
                        }
                    });
                }
            } else if (attribute.type === 'blocks') {
                // Handle blocks array (Strapi 5 format)
                if (Array.isArray(value)) {
                    this.extractBlocks(value, newPath, segments, uid);
                }
            } else if (attribute.type === 'component') {
                const componentUid = attribute.component;
                const compSchema = this.getSchema(componentUid);
                if (compSchema) {
                    if (attribute.repeatable && Array.isArray(value)) {
                        value.forEach((item, index) => {
                            this.traverseForExtract(compSchema, item, [...newPath, index], segments, componentUid);
                        });
                    } else {
                        this.traverseForExtract(compSchema, value, newPath, segments, componentUid);
                    }
                }
            } else if (attribute.type === 'dynamiczone') {
                if (Array.isArray(value)) {
                    value.forEach((item, index) => {
                        if (item && item.__component) {
                            const compSchema = this.getSchema(item.__component);
                            if (compSchema) {
                                this.traverseForExtract(compSchema, item, [...newPath, index], segments, item.__component);
                            }
                        }
                    });
                }
            }
            // relation, media, json, password, email, integer, float, decimal, date, time, datetime, timestamp, boolean, enumeration, uid are ignored
        }
    }

    private extractBlocks(blocks: any[], pathPrefix: (string | number)[], segments: Segment[], uid: string) {
        // DFS traversal of block nodes to find 'text' types
        const traverseNodes = (nodes: any[], currentPath: (string | number)[]) => {
            nodes.forEach((node, index) => {
                const type = node?.type;
                const newPath = [...currentPath, index];

                if (type === 'text' && typeof node.text === 'string' && node.text.trim() !== '') {
                    segments.push({
                        path: [...newPath, 'text'],
                        text: node.text,
                        meta: { fieldType: 'blocks_text', uid }
                    });
                }

                if (node.children && Array.isArray(node.children)) {
                    traverseNodes(node.children, [...newPath, 'children']);
                }
            });
        };

        traverseNodes(blocks, pathPrefix);
    }

    private setValueAtPath(obj: any, path: (string | number)[], value: any) {
        let current = obj;
        for (let i = 0; i < path.length - 1; i++) {
            if (current[path[i]] === undefined) {
                // Initialize as array if next index is number, object otherwise
                current[path[i]] = typeof path[i + 1] === 'number' ? [] : {};
            }
            current = current[path[i]];
        }
        const lastKey = path[path.length - 1];
        current[lastKey] = value;
    }
}
