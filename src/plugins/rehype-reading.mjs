function standaloneImage(paragraph) {
  const children = (paragraph.children ?? []).filter(
    (child) => child.type !== 'text' || child.value.trim() !== '',
  );
  return children.length === 1 && children[0].type === 'element' && children[0].tagName === 'img'
    ? children[0]
    : null;
}

function imageFigure(image) {
  const alt = String(image.properties?.alt ?? '');
  image.properties = { ...image.properties, loading: 'lazy', decoding: 'async' };
  const children = [
    {
      type: 'element',
      tagName: 'button',
      properties: {
        type: 'button',
        className: ['image-zoom'],
        'aria-label': alt ? `放大图片：${alt}` : '放大图片',
      },
      children: [image],
    },
  ];
  const hasCaption = alt && alt.toLowerCase() !== 'alt text' && !/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(alt);
  if (hasCaption) {
    children.push({
      type: 'element',
      tagName: 'figcaption',
      properties: {},
      children: [{ type: 'text', value: alt }],
    });
  }
  return { type: 'element', tagName: 'figure', properties: {}, children };
}

function visit(node) {
  const children = node.children ?? [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === 'element' && child.tagName === 'p') {
      const image = standaloneImage(child);
      if (image) {
        children[i] = imageFigure(image);
        continue;
      }
    }
    visit(child);
  }
}

export default function rehypeReading() {
  return (tree) => visit(tree);
}
