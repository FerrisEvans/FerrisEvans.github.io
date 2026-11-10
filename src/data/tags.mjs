/** @type {Record<string, [string, string]>} */
export const tagLabels = {
  writing: ['写作', 'Writing'], 'code-examples': ['代码示例', 'Code examples'],
};

/** @param {string} name */
export const tagId = name => Object.entries(tagLabels).find(([, labels]) => labels.includes(name))?.[0] ?? name;
