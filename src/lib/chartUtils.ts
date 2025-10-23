import { SeriesMarker, Time } from "lightweight-charts";
import { CandlestickData, Zone, Line, Pattern } from './types';

export const formatMarkers = (
    markers: (Zone | Line | Pattern)[],
    data: CandlestickData[]
): SeriesMarker<Time>[] => {
    if (!markers.length || !data.length) return [];

    const dataTimes = new Set(data.map(d => new Date(d.time).getTime()));

    return markers.map((marker, index) => {
        const markerTime = new Date(marker.time).getTime();

        // Find the closest available trading day FOR markers
        let closestTime = marker.time;
        if (!dataTimes.has(markerTime)) {
            const sortedTimes = Array.from(dataTimes).sort((a, b) => a - b);
            const closestTimestamp = sortedTimes.reduce((prev, curr) =>
                Math.abs(curr - markerTime) < Math.abs(prev - markerTime) ? curr : prev
            );
            closestTime = new Date(closestTimestamp).toISOString().split('T')[0] as Time;
        }

        const position = 'position' in marker ? marker.position : 'aboveBar';

        let shape: 'arrowUp' | 'arrowDown' | 'circle' = 'circle';
        let color = '#facc15'; // Default yellow
        let text = `M${index}`;

        if ('type' in marker) {
            if (marker.type.includes('Bullish')) {
                shape = 'arrowUp';
                color = '#22c55e'; // Green
            } else if (marker.type.includes('Bearish')) {
                shape = 'arrowDown';
                color = '#ef4444'; // Red
            }
        }

        if ('pattern' in marker && marker.pattern) {
             text = marker.pattern;
        }


        return {
            time: closestTime,
            position: position,
            color: color,
            shape: shape,
            text: text,
            size: 1,
        };
    }).filter(m => m !== null) as SeriesMarker<Time>[];
};

export const formatZones = (zones: Zone[], color: string) => {
    return zones.map(zone => ({
        id: `zone-${zone.time}-${Math.random()}`,
        start: zone.time,
        end: new Date(new Date(zone.time).getTime() + 86400000 * 5).toISOString().split('T')[0], // Extend zone visually
        price_high: zone.high,
        price_low: zone.low,
        color: color
    }));
};

export const formatLines = (lines: Line[], color: string) => {
    return lines.map(line => ({
        id: `line-${line.time}-${Math.random()}`,
        price: line.price,
        color: color,
        text: line.type,
    }));
};