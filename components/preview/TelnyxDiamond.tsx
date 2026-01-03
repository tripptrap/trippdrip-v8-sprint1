'use client';

import { motion } from 'framer-motion';

export default function TelnyxDiamond() {
  return (
    <div className="relative w-[350px] h-[350px] md:w-[450px] md:h-[450px]">
      {/* Main 3D Container */}
      <div
        className="absolute inset-0"
        style={{ perspective: '1200px' }}
      >
        <motion.div
          className="relative w-full h-full flex items-center justify-center"
          style={{ transformStyle: 'preserve-3d' }}
          animate={{
            rotateY: [0, 10, 0, -10, 0],
            rotateX: [0, 5, 0, -5, 0],
          }}
          transition={{
            rotateY: { duration: 10, repeat: Infinity, ease: 'easeInOut' },
            rotateX: { duration: 8, repeat: Infinity, ease: 'easeInOut' },
          }}
        >
          {/* Central Glowing Orb */}
          <motion.div
            className="absolute w-20 h-20 md:w-24 md:h-24 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(20, 184, 166, 0.8) 0%, rgba(6, 182, 212, 0.4) 50%, transparent 70%)',
              boxShadow: '0 0 60px rgba(20, 184, 166, 0.6), 0 0 100px rgba(6, 182, 212, 0.4)',
            }}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.8, 1, 0.8],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          {/* Orbiting Ring 1 */}
          <motion.div
            className="absolute w-48 h-48 md:w-64 md:h-64 rounded-full border-2 border-sky-400/30"
            style={{ transformStyle: 'preserve-3d' }}
            animate={{
              rotateX: [60, 60, 60],
              rotateZ: [0, 360],
            }}
            transition={{
              rotateZ: { duration: 12, repeat: Infinity, ease: 'linear' },
            }}
          >
            {/* Orbit dot */}
            <motion.div
              className="absolute w-3 h-3 md:w-4 md:h-4 bg-sky-400 rounded-full"
              style={{
                top: '-6px',
                left: '50%',
                transform: 'translateX(-50%)',
                boxShadow: '0 0 20px rgba(20, 184, 166, 0.8)',
              }}
            />
          </motion.div>

          {/* Orbiting Ring 2 */}
          <motion.div
            className="absolute w-56 h-56 md:w-72 md:h-72 rounded-full border border-cyan-400/20"
            style={{ transformStyle: 'preserve-3d' }}
            animate={{
              rotateX: [-60, -60, -60],
              rotateY: [30, 30, 30],
              rotateZ: [0, -360],
            }}
            transition={{
              rotateZ: { duration: 15, repeat: Infinity, ease: 'linear' },
            }}
          >
            {/* Orbit dot */}
            <motion.div
              className="absolute w-2 h-2 md:w-3 md:h-3 bg-cyan-400 rounded-full"
              style={{
                top: '-4px',
                left: '50%',
                transform: 'translateX(-50%)',
                boxShadow: '0 0 15px rgba(6, 182, 212, 0.8)',
              }}
            />
          </motion.div>

          {/* Orbiting Ring 3 - Vertical */}
          <motion.div
            className="absolute w-40 h-40 md:w-52 md:h-52 rounded-full border border-sky-300/25"
            style={{ transformStyle: 'preserve-3d' }}
            animate={{
              rotateY: [90, 90, 90],
              rotateZ: [0, 360],
            }}
            transition={{
              rotateZ: { duration: 10, repeat: Infinity, ease: 'linear' },
            }}
          >
            {/* Orbit dot */}
            <motion.div
              className="absolute w-2 h-2 bg-sky-300 rounded-full"
              style={{
                top: '-4px',
                left: '50%',
                transform: 'translateX(-50%)',
                boxShadow: '0 0 12px rgba(94, 234, 212, 0.8)',
              }}
            />
          </motion.div>

          {/* Floating Hexagon Outlines */}
          <motion.svg
            className="absolute w-32 h-32 md:w-40 md:h-40"
            viewBox="0 0 100 100"
            style={{ transform: 'translateZ(30px)' }}
            animate={{
              rotate: [0, 360],
              scale: [1, 1.1, 1],
            }}
            transition={{
              rotate: { duration: 20, repeat: Infinity, ease: 'linear' },
              scale: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            <polygon
              points="50,5 90,27.5 90,72.5 50,95 10,72.5 10,27.5"
              fill="none"
              stroke="url(#hexGrad)"
              strokeWidth="1.5"
              opacity="0.4"
            />
            <defs>
              <linearGradient id="hexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#14b8a6" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
          </motion.svg>

          {/* Inner Hexagon */}
          <motion.svg
            className="absolute w-20 h-20 md:w-24 md:h-24"
            viewBox="0 0 100 100"
            style={{ transform: 'translateZ(50px)' }}
            animate={{
              rotate: [0, -360],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              rotate: { duration: 15, repeat: Infinity, ease: 'linear' },
              opacity: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            <polygon
              points="50,10 85,30 85,70 50,90 15,70 15,30"
              fill="none"
              stroke="#14b8a6"
              strokeWidth="2"
              opacity="0.5"
            />
          </motion.svg>
        </motion.div>
      </div>

      {/* Floating Particles */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: `${8 + (i % 3) * 4}px`,
            height: `${8 + (i % 3) * 4}px`,
            background: i % 2 === 0 ? '#14b8a6' : '#06b6d4',
            top: `${15 + (i * 12)}%`,
            left: i % 2 === 0 ? `${10 + (i * 5)}%` : `${70 + (i * 4)}%`,
            filter: 'blur(1px)',
          }}
          animate={{
            y: [0, -20, 0, 20, 0],
            x: [0, 10, 0, -10, 0],
            opacity: [0.3, 0.7, 0.3],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 4 + i * 0.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.3,
          }}
        />
      ))}

      {/* Ambient Glow Effect */}
      <div
        className="absolute top-1/2 left-1/2 w-[300px] h-[300px] md:w-[400px] md:h-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(20, 184, 166, 0.15) 0%, rgba(6, 182, 212, 0.08) 40%, transparent 70%)',
        }}
      />
    </div>
  );
}
