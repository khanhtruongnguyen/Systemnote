import React, { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { Trash2 } from 'lucide-react';

interface CustomEdgeData {
  onDelete?: (id: string) => void;
  [key: string]: unknown;
}

export const CustomEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}) => {
  const [hovered, setHovered] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  });

  const edgeData = data as CustomEdgeData | undefined;
  const strokeColor = selected ? '#4f46e5' : hovered ? '#64748b' : '#94a3b8';
  const markerId = `sn-edge-arrow-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="cursor-pointer"
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5.5"
          markerHeight="5.5"
          orient="auto-start-reverse"
        >
          <path
            d="M 1.5 1.8 L 8.5 5 L 1.5 8.2 z"
            fill={strokeColor}
            className="transition-colors duration-150"
          />
        </marker>
      </defs>

      {selected && (
        <path
          d={edgePath}
          fill="none"
          stroke="#4f46e5"
          strokeWidth={7}
          strokeOpacity={0.14}
          strokeLinecap="round"
          className="pointer-events-none"
        />
      )}

      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={22}
        markerEnd={`url(#${markerId})`}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? 2 : hovered ? 1.8 : 1.5,
          strokeLinecap: 'round',
        }}
      />

      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan z-30"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                edgeData?.onDelete?.(id);
              }}
              title="Xóa đường nối này"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-600 text-[11px] font-medium shadow-[0_2px_10px_rgba(15,23,42,0.12)] border border-rose-200/90 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Xóa nối</span>
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
};
