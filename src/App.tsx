import { useEffect, useRef, useState } from 'react';

const inner = Array.from({ length: 15 }, (_, i) => "C" + (i + 1));
const outer = Array.from({ length: 30 }, (_, i) => "n" + (i + 1));

const LINKS_PER_INNER = 5;
const links: [number, number][] = [];
for (let i = 0; i < inner.length; i++) {
  const base = Math.round((i / inner.length) * outer.length);
  for (let k = 0; k < LINKS_PER_INNER; k++) {
    const o = (base + Math.round((k * outer.length) / LINKS_PER_INNER) + (i % 3)) % outer.length;
    links.push([i, o]);
  }
}
const covered = new Set(links.map(l => l[1]));
for (let o = 0; o < outer.length; o++) {
  if (!covered.has(o)) { links.push([o % inner.length, o]); covered.add(o); }
}

const R_RATIO_OUTER = 0.36;
const R_RATIO_INNER = 0.16;
const AMBER = "#ffb454";
const ICE = "#7dd3fc";

// Constants for physics
const K_HOME = 0.12;
const K_LINK = 0;
const DAMP = 0.4;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const [stats] = useState({ inner: inner.length, outer: outer.length, links: links.length });
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let w = window.innerWidth;
    let h = window.innerHeight;
    
    // Support high DPI displays
    const dpr = window.devicePixelRatio || 1;
    
    const setCanvasSize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    
    setCanvasSize();
    
    let rOut = Math.min(w, h) * R_RATIO_OUTER;
    let rIn = Math.min(w, h) * R_RATIO_INNER;
    
    // Transform state
    let transform = { x: w / 2, y: h / 2, scale: 1 };
    
    interface Node {
      id: number;
      name: string;
      category: 0 | 1;
      hx: number; hy: number;
      x: number; y: number;
      vx: number; vy: number;
      radius: number;
      color: string;
      emphasis: number;
      blur: number;
    }
    
    const nodes: Node[] = [];
    
    // Init inner nodes
    for(let i=0; i<inner.length; i++) {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / inner.length;
      nodes.push({
        id: i,
        name: inner[i],
        category: 0,
        hx: rIn * Math.cos(angle),
        hy: rIn * Math.sin(angle),
        x: rIn * Math.cos(angle),
        y: rIn * Math.sin(angle),
        vx: 0, vy: 0,
        radius: 20,
        color: AMBER,
        emphasis: 0,
        blur: 0
      });
    }
    
    // Init outer nodes
    for(let i=0; i<outer.length; i++) {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / outer.length;
      nodes.push({
        id: inner.length + i,
        name: outer[i],
        category: 1,
        hx: rOut * Math.cos(angle),
        hy: rOut * Math.sin(angle),
        x: rOut * Math.cos(angle),
        y: rOut * Math.sin(angle),
        vx: 0, vy: 0,
        radius: 6.5,
        color: ICE,
        emphasis: 0,
        blur: 0
      });
    }
    
    interface Edge {
      source: number;
      target: number;
      restX: number;
      restY: number;
      emphasis: number;
      blur: number;
    }
    
    const edges: Edge[] = links.map(([i, o]) => {
      const s = nodes[i];
      const t = nodes[inner.length + o];
      return {
        source: i,
        target: inner.length + o,
        restX: t.x - s.x,
        restY: t.y - s.y,
        emphasis: 0,
        blur: 0
      };
    });
    
    let rafId: number;
    let dragNode: Node | null = null;
    let lastMouse = { x: 0, y: 0 };
    let hoverNode: Node | null = null;
    
    const draw = () => {
      // Clear
      ctx.clearRect(0, 0, w, h);
      
      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.scale, transform.scale);
      
      
      // Draw background rings
      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
      ctx.lineWidth = 12 / transform.scale;
      ctx.beginPath();
      ctx.arc(0, 0, rIn, 0, Math.PI * 2);
      ctx.stroke();
      
      // Outer platform (light ring under small nodes)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
      ctx.lineWidth = 20 / transform.scale;
      ctx.beginPath();
      ctx.arc(0, 0, rOut, 0, Math.PI * 2);
      ctx.stroke();

      // Outer platform edges for a glass track effect
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 1 / transform.scale;
      ctx.beginPath();
      ctx.arc(0, 0, rOut - 10 / transform.scale, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(0, 0, rOut + 10 / transform.scale, 0, Math.PI * 2);
      ctx.stroke();

      edges.forEach(e => {
        const s = nodes[e.source];
        const t = nodes[e.target];
        
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        // Add a slight curve (quadratic curve)
        const cpX = (s.x + t.x) / 2 - (t.y - s.y) * 0.15;
        const cpY = (s.y + t.y) / 2 + (t.x - s.x) * 0.15;
        ctx.quadraticCurveTo(cpX, cpY, t.x, t.y);
        
        let r = 147 + (37 - 147) * e.emphasis;
        let g = 197 + (99 - 197) * e.emphasis;
        let b = 253 + (235 - 253) * e.emphasis;
        let a = 0.45 + (0.8 - 0.45) * e.emphasis;
        let lw = 1.2 + (2.0 - 1.2) * e.emphasis;
        let sb = 10 * e.emphasis;
        
        if (e.blur > 0) {
            a = 0.45 - (0.45 - 0.15) * e.blur;
            lw = 1.2 - (1.2 - 1.0) * e.blur;
        }

        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
        ctx.lineWidth = lw / transform.scale;
        ctx.shadowColor = `rgba(37, 99, 235, ${0.4 * e.emphasis})`;
        ctx.shadowBlur = sb;
        ctx.stroke();
      });
      ctx.shadowBlur = 0;
      
      // Draw nodes
      const time = performance.now() / 1000;
      nodes.forEach(n => {
        let a = 1.0 - (1.0 - 0.2) * n.blur;
        ctx.globalAlpha = a;
        
        if (n.emphasis > 0.01) {
          const pulseProgress = (time * 1.5) % 1;
          const pulseRadius = n.radius + (n.radius * 1.5) * pulseProgress;
          const pulseAlpha = (1 - pulseProgress) * 0.5 * n.emphasis;
          
          ctx.beginPath();
          ctx.arc(n.x, n.y, pulseRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(59, 130, 246, ${pulseAlpha})`;
          ctx.fill();
        }
        
        // Shadow
        ctx.shadowColor = n.category === 0 ? "rgba(59, 130, 246, 0.45)" : "rgba(147, 197, 253, 0.5)";
        let baseSb = n.category === 0 ? 22 : 14;
        ctx.shadowBlur = baseSb + (34 - baseSb) * n.emphasis;
        
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        
        if (n.category === 0) {
          const grad = ctx.createRadialGradient(n.x - n.radius*0.3, n.y - n.radius*0.4, 0, n.x, n.y, n.radius);
          grad.addColorStop(0, "#93c5fd");
          grad.addColorStop(0.55, "#3b82f6");
          grad.addColorStop(1, "#1d4ed8");
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.lineWidth = 2 / transform.scale;
          ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
          ctx.stroke();
          
          ctx.shadowBlur = 0; // Don't shadow text
          ctx.fillStyle = "#ffffff";
          ctx.font = `600 ${12 / transform.scale}px "Vazirmatn", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(n.name, n.x, n.y);
        } else {
          ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
          ctx.fill();
          ctx.lineWidth = 2 / transform.scale;
          ctx.strokeStyle = "rgba(59, 130, 246, 0.8)";
          ctx.stroke();
          
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#1e293b";
          ctx.font = `500 ${10.5 / transform.scale}px "Vazirmatn", sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          if (n.emphasis > 0.5) {
            ctx.font = `700 ${10.5 / transform.scale}px "Vazirmatn", sans-serif`;
            ctx.fillStyle = "#1d4ed8";
          }
          ctx.fillText(n.name, n.x + n.radius + 8/transform.scale, n.y);
        }
      });
      ctx.globalAlpha = 1;
      
      ctx.restore();
      
      // Draw tooltip
      if (hoverNode) {
        const screenX = hoverNode.x * transform.scale + transform.x;
        const screenY = hoverNode.y * transform.scale + transform.y;
        
        const deg = hoverNode.category === 0 
          ? edges.filter(e => e.source === hoverNode!.id).length
          : edges.filter(e => e.target === hoverNode!.id).length;
          
        const text = `${hoverNode.name} · ${deg} اتصال`;
        
        ctx.font = "12.5px Vazirmatn, Tahoma";
        const textWidth = ctx.measureText(text).width;
        
        const padX = 14;
        const padY = 8;
        const boxW = textWidth + padX * 2;
        const boxH = 12.5 + padY * 2;
        
        let toolX = screenX + 15;
        let toolY = screenY + 15;
        
        ctx.shadowColor = "rgba(15, 23, 42, 0.08)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
        
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.strokeStyle = "rgba(15, 23, 42, 0.1)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(toolX, toolY, boxW, boxH, 10);
        ctx.fill();
        ctx.stroke();
        
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        
        ctx.fillStyle = "#0f172a";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, toolX + boxW / 2, toolY + boxH / 2 + 1);
      }
    };
    
    const loop = () => {
      // Interpolate emphasis and blur for smooth transitions
      const connectedNodes = new Set<number>();
      if (hoverNode) {
        connectedNodes.add(hoverNode.id);
        edges.forEach(e => {
          if (e.source === hoverNode!.id) connectedNodes.add(e.target);
          if (e.target === hoverNode!.id) connectedNodes.add(e.source);
        });
      }

      const SMOOTH = 0.15;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        let targetEmp = 0;
        let targetBlur = 0;
        if (hoverNode) {
          if (connectedNodes.has(n.id)) {
            targetEmp = 1;
          } else {
            targetBlur = 1;
          }
        }
        n.emphasis += (targetEmp - n.emphasis) * SMOOTH;
        n.blur += (targetBlur - n.blur) * SMOOTH;
      }

      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        let targetEmp = 0;
        let targetBlur = 0;
        if (hoverNode) {
          if (e.source === hoverNode.id || e.target === hoverNode.id) {
            targetEmp = 1;
          } else {
            targetBlur = 1;
          }
        }
        e.emphasis += (targetEmp - e.emphasis) * SMOOTH;
        e.blur += (targetBlur - e.blur) * SMOOTH;
      }

      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i] === dragNode) continue;
        const s = nodes[i];
        s.vx += (s.hx - s.x) * K_HOME;
        s.vy += (s.hy - s.y) * K_HOME;
      }
      for (let e = 0; e < edges.length; e++) {
        const edge = edges[e];
        const a = edge.source;
        const b = edge.target;
        const fx = (nodes[b].x - nodes[a].x - edge.restX) * K_LINK;
        const fy = (nodes[b].y - nodes[a].y - edge.restY) * K_LINK;
        if (nodes[a] !== dragNode) { nodes[a].vx += fx; nodes[a].vy += fy; }
        if (nodes[b] !== dragNode) { nodes[b].vx -= fx; nodes[b].vy -= fy; }
      }
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i] === dragNode) continue;
        const s = nodes[i];
        s.vx *= DAMP; s.vy *= DAMP;
        s.x += s.vx; s.y += s.vy;
      }
      
      draw();
      rafId = requestAnimationFrame(loop);
    };
    
    rafId = requestAnimationFrame(loop);
    
    const getPointerPos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };
    
    const screenToWorld = (sx: number, sy: number) => {
      return {
        x: (sx - transform.x) / transform.scale,
        y: (sy - transform.y) / transform.scale
      };
    };
    
    const handleMouseDown = (e: MouseEvent) => {
      const pos = getPointerPos(e);
      const worldPos = screenToWorld(pos.x, pos.y);
      lastMouse = pos;
      
      let clickedNode = null;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const dx = worldPos.x - n.x;
        const dy = worldPos.y - n.y;
        if (dx * dx + dy * dy < (n.radius + 5) * (n.radius + 5)) {
          clickedNode = n;
          break;
        }
      }
      
      if (clickedNode) {
        dragNode = clickedNode;
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      const pos = getPointerPos(e);
      const worldPos = screenToWorld(pos.x, pos.y);
      
      if (dragNode) {
        dragNode.x = worldPos.x;
        dragNode.y = worldPos.y;
        dragNode.vx = 0;
        dragNode.vy = 0;
      } else {
        let foundHover = null;
        for (let i = nodes.length - 1; i >= 0; i--) {
          const n = nodes[i];
          const dx = worldPos.x - n.x;
          const dy = worldPos.y - n.y;
          if (dx * dx + dy * dy < (n.radius + 5) * (n.radius + 5)) {
            foundHover = n;
            break;
          }
        }
        if (hoverNode !== foundHover) {
          hoverNode = foundHover;
          document.body.style.cursor = hoverNode ? 'pointer' : 'default';
        }
      }
      
      lastMouse = pos;
    };
    
    const handleMouseUp = () => {
      if (dragNode) {
        dragNode.hx = dragNode.x;
        dragNode.hy = dragNode.y;
        edges.forEach(e => {
          if (e.source === dragNode!.id || e.target === dragNode!.id) {
            e.restX = nodes[e.target].x - nodes[e.source].x;
            e.restY = nodes[e.target].y - nodes[e.source].y;
          }
        });
        dragNode = null;
      }
    };
    
    const handleResize = () => {
      setCanvasSize();
      const oldOut = rOut, oldIn = rIn;
      rOut = Math.min(w, h) * R_RATIO_OUTER;
      rIn = Math.min(w, h) * R_RATIO_INNER;
      
      nodes.forEach(s => {
        const isInner = s.category === 0;
        const total = isInner ? inner.length : outer.length;
        const idx = isInner ? s.id : s.id - inner.length;
        const angle = -Math.PI / 2 + (2 * Math.PI * idx) / total;
        const radius = isInner ? rIn : rOut;
        
        s.hx = radius * Math.cos(angle);
        s.hy = radius * Math.sin(angle);
        s.x = s.hx;
        s.y = s.hy;
        s.vx = 0; s.vy = 0;
      });
      edges.forEach(e => {
        e.restX = nodes[e.target].x - nodes[e.source].x;
        e.restY = nodes[e.target].y - nodes[e.source].y;
      });
      transform.x = w / 2;
      transform.y = h / 2;
      transform.scale = 1;
    };
    
    let resetRafId: number | null = null;
    
    const handleReset = () => {
      if (resetRafId) cancelAnimationFrame(resetRafId);
      
      const duration = 1200;
      const startTime = performance.now();
      
      const initialHomes = nodes.map(n => ({ hx: n.x, hy: n.y }));
      const targetHomes = nodes.map(s => {
        const isInner = s.category === 0;
        const total = isInner ? inner.length : outer.length;
        const idx = isInner ? s.id : s.id - inner.length;
        const angle = -Math.PI / 2 + (2 * Math.PI * idx) / total;
        const radius = isInner ? rIn : rOut;
        
        return {
          x: radius * Math.cos(angle),
          y: radius * Math.sin(angle)
        };
      });
      
      const animateReset = (time: number) => {
        let progress = (time - startTime) / duration;
        if (progress > 1) progress = 1;
        
        const ease = progress < 0.5 
          ? 4 * progress * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
          
        nodes.forEach((n, i) => {
          n.hx = initialHomes[i].hx + (targetHomes[i].x - initialHomes[i].hx) * ease;
          n.hy = initialHomes[i].hy + (targetHomes[i].y - initialHomes[i].hy) * ease;
        });
        
        edges.forEach(e => {
          e.restX = nodes[e.target].hx - nodes[e.source].hx;
          e.restY = nodes[e.target].hy - nodes[e.source].hy;
        });
        
        if (progress < 1) {
          resetRafId = requestAnimationFrame(animateReset);
        } else {
          resetRafId = null;
        }
      };
      
      resetRafId = requestAnimationFrame(animateReset);
    };
    
    resetRef.current = handleReset;
    
    canvas.addEventListener('pointerdown', handleMouseDown);
    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
    window.addEventListener('pointercancel', handleMouseUp);
    window.addEventListener('resize', handleResize);
    
    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', handleMouseDown);
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
      window.removeEventListener('pointercancel', handleMouseUp);
      window.removeEventListener('resize', handleResize);
      document.body.style.cursor = 'default';
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="fixed inset-0 z-10 block touch-none" />
      
      <header className="fixed top-5 right-5 sm:top-7 sm:right-8 z-20 pointer-events-none max-w-[calc(100vw-120px)] sm:max-w-none">
        <h1 className="m-0 text-[18px] sm:text-[22px] font-extrabold tracking-[-0.01em] text-slate-800">گراف مداری</h1>
        <p className="m-0 mt-1 sm:mt-1.5 text-[11px] sm:text-[12.5px] font-medium text-slate-500 max-w-[200px] sm:max-w-[300px] leading-relaxed">
          اتصال گره‌های حلقه‌ی بیرونی به هاب‌های مرکزی — روی هر گره برو تا مسیرهاش روشن بشه.
        </p>
      </header>
      
      <button 
        onClick={() => resetRef.current()}
        className="fixed top-5 left-5 sm:top-7 sm:left-8 z-20 px-3 sm:px-[18px] py-2 sm:py-2.5 text-[11px] sm:text-[12.5px] font-medium border border-slate-200/60 rounded-[10px] sm:rounded-[12px] bg-white/70 backdrop-blur-[14px] shadow-[0_2px_12px_rgba(15,23,42,0.04)] text-slate-700 hover:bg-white hover:shadow-md hover:text-slate-900 transition-all cursor-pointer"
      >
        بازنشانی نما
      </button>

      <div className="fixed bottom-5 right-5 left-5 sm:left-auto sm:bottom-6 sm:right-8 z-20 flex flex-wrap justify-center sm:justify-start items-center gap-3 sm:gap-[22px] px-3 sm:px-[18px] py-2.5 sm:py-3 border border-slate-200/60 rounded-[12px] sm:rounded-[14px] bg-white/70 backdrop-blur-[14px] shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
        <span className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-[12.5px] text-slate-500">
          <span className="w-2 h-2 sm:w-[9px] sm:h-[9px] rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
          هاب داخلی <b className="font-medium text-[11.5px] sm:text-[13px] text-slate-800">{stats.inner}</b>
        </span>
        <span className="w-[1px] h-4 sm:h-5 bg-slate-200/80"></span>
        <span className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-[12.5px] text-slate-500">
          <span className="w-2 h-2 sm:w-[9px] sm:h-[9px] rounded-full bg-white border-[1.5px] sm:border-2 border-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.4)] box-border"></span>
          گره بیرونی <b className="font-medium text-[11.5px] sm:text-[13px] text-slate-800">{stats.outer}</b>
        </span>
        <span className="w-[1px] h-4 sm:h-5 bg-slate-200/80"></span>
        <span className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-[12.5px] text-slate-500">
          اتصال <b className="font-medium text-[11.5px] sm:text-[13px] text-slate-800">{stats.links}</b>
        </span>
      </div>

      <div className="hidden sm:block fixed bottom-6 left-8 z-20 text-[11.5px] text-slate-400 font-medium pointer-events-none">
        گره‌ها را جابه‌جا کنید
      </div>
    </>
  );
}
