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
            rotateY: [0, 8, 0, -8, 0],
            rotateX: [0, 4, 0, -4, 0],
          }}
          transition={{
            rotateY: { duration: 8, repeat: Infinity, ease: 'easeInOut' },
            rotateX: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
          }}
        >
          {/* HyveWyre Honeycomb Logo */}
          <motion.div
            className="relative"
            animate={{
              scale: [1, 1.03, 1],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              filter: 'drop-shadow(0 20px 60px rgba(6, 182, 212, 0.4)) drop-shadow(0 10px 30px rgba(45, 212, 191, 0.3))',
            }}
          >
            <svg
              width="220"
              height="260"
              viewBox="0 0 260 280"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="md:w-[280px] md:h-[330px]"
            >
              <defs>
                <linearGradient id="hiveGradient" x1="130" y1="0" x2="130" y2="280" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>

              {/* Honeycomb structure centered at 130, 140 */}
              <g transform="translate(130, 120)">
                {/* Row 1: 1 hexagon at top */}
                <path
                  d="M 0,-80 L 30,-60 L 30,-20 L 0,0 L -30,-20 L -30,-60 Z"
                  stroke="url(#hiveGradient)"
                  strokeWidth="6"
                  fill="none"
                  strokeLinejoin="round"
                />

                {/* Row 2: 2 hexagons */}
                <path
                  d="M -40,-40 L -10,-20 L -10,20 L -40,40 L -70,20 L -70,-20 Z"
                  stroke="url(#hiveGradient)"
                  strokeWidth="6"
                  fill="none"
                  strokeLinejoin="round"
                />
                <path
                  d="M 40,-40 L 70,-20 L 70,20 L 40,40 L 10,20 L 10,-20 Z"
                  stroke="url(#hiveGradient)"
                  strokeWidth="6"
                  fill="none"
                  strokeLinejoin="round"
                />

                {/* Row 3: 3 hexagons */}
                <path
                  d="M -80,0 L -50,20 L -50,60 L -80,80 L -110,60 L -110,20 Z"
                  stroke="url(#hiveGradient)"
                  strokeWidth="6"
                  fill="none"
                  strokeLinejoin="round"
                />
                <path
                  d="M 0,0 L 30,20 L 30,60 L 0,80 L -30,60 L -30,20 Z"
                  stroke="url(#hiveGradient)"
                  strokeWidth="6"
                  fill="none"
                  strokeLinejoin="round"
                />
                <path
                  d="M 80,0 L 110,20 L 110,60 L 80,80 L 50,60 L 50,20 Z"
                  stroke="url(#hiveGradient)"
                  strokeWidth="6"
                  fill="none"
                  strokeLinejoin="round"
                />

                {/* Row 4: 2 hexagons at bottom */}
                <path
                  d="M -40,40 L -10,60 L -10,100 L -40,120 L -70,100 L -70,60 Z"
                  stroke="url(#hiveGradient)"
                  strokeWidth="6"
                  fill="none"
                  strokeLinejoin="round"
                />
                <path
                  d="M 40,40 L 70,60 L 70,100 L 40,120 L 10,100 L 10,60 Z"
                  stroke="url(#hiveGradient)"
                  strokeWidth="6"
                  fill="none"
                  strokeLinejoin="round"
                />
              </g>
            </svg>
          </motion.div>

          {/* Glow Ring Layer */}
          <motion.div
            className="absolute w-[240px] h-[280px] md:w-[300px] md:h-[350px] rounded-[30px]"
            style={{
              background: 'transparent',
              border: '2px solid rgba(45, 212, 191, 0.2)',
              transform: 'translateZ(-20px)',
            }}
            animate={{
              opacity: [0.2, 0.4, 0.2],
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </motion.div>
      </div>

      {/* Floating Particles */}
      <motion.div
        className="absolute w-3 h-3 bg-teal-400 rounded-full"
        style={{ top: '15%', left: '20%', filter: 'blur(1px)' }}
        animate={{
          y: [-15, 15, -15],
          x: [-8, 8, -8],
          opacity: [0.4, 0.8, 0.4],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className="absolute w-2 h-2 bg-cyan-400 rounded-full"
        style={{ top: '70%', left: '15%', filter: 'blur(1px)' }}
        animate={{
          y: [10, -20, 10],
          x: [5, -10, 5],
          opacity: [0.3, 0.7, 0.3],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1,
        }}
      />

      <motion.div
        className="absolute w-4 h-4 bg-teal-300 rounded-full"
        style={{ top: '25%', right: '10%', filter: 'blur(2px)' }}
        animate={{
          y: [-20, 20, -20],
          x: [10, -5, 10],
          opacity: [0.5, 0.9, 0.5],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.5,
        }}
      />

      <motion.div
        className="absolute w-2.5 h-2.5 bg-cyan-300 rounded-full"
        style={{ bottom: '20%', right: '25%', filter: 'blur(1px)' }}
        animate={{
          y: [15, -15, 15],
          x: [-10, 10, -10],
          opacity: [0.4, 0.8, 0.4],
        }}
        transition={{
          duration: 4.5,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 2,
        }}
      />

      {/* Ambient Glow Effect */}
      <div
        className="absolute top-1/2 left-1/2 w-[300px] h-[300px] md:w-[400px] md:h-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(45, 212, 191, 0.15) 0%, rgba(6, 182, 212, 0.05) 50%, transparent 70%)',
        }}
      />
    </div>
  );
}
