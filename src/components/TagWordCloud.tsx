import { Chart, type ChartDataEvent, type ChartTooltipContext } from 'animal-island-ui';
import '../styles/tag-word-cloud.css';

interface TagWordCloudProps {
  tags: { name: string; count: number; href: string }[];
}

const colors = Array.from({ length: 6 }, (_, index) => `var(--tag-cloud-color-${index + 1})`);
const formatCount = (count: number) => `${count} 篇笔记`;

function renderTooltip({ name, items }: ChartTooltipContext) {
  return (
    <div className="tag-word-cloud-tooltip">
      <strong>{name}</strong>
      <span>{items[0]?.formattedValue}</span>
    </div>
  );
}

/** Animal Island UI owns placement, resizing, focus navigation and tooltips. */
export default function TagWordCloud({ tags }: TagWordCloudProps) {
  const openTag = ({ dataIndex }: ChartDataEvent) => {
    const tag = tags[dataIndex];
    if (tag) window.location.assign(tag.href);
  };

  return (
    <Chart
      className="tag-word-cloud"
      aria-label="标签词云"
      type="word"
      series={[{ name: '标签', data: tags.map(tag => ({ name: tag.name, value: tag.count })) }]}
      colors={colors}
      height={320}
      legend={false}
      selectable={false}
      valueFormatter={formatCount}
      tooltip={{ trigger: 'item', crosshair: false, render: renderTooltip }}
      onDataClick={openTag}
    />
  );
}
