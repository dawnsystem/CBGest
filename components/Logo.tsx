/**
 * @fileoverview Componente Logo CBGest
 * @description Logo isométrico con cubos 3D que forman las letras C, B, G
 */

import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ size = 48, className = '', showText = false }) => {
  // Scale factor
  const scale = size / 100;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg
        width={100 * scale}
        height={120 * scale}
        viewBox="0 0 100 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Cubo superior pequeño (ventana) */}
        <g>
          <path d="M50 0 L70 12 L50 24 L30 12 Z" fill="#6A9BC5" />
          <path d="M30 12 L30 32 L50 44 L50 24 Z" fill="#3D5A80" />
          <path d="M50 24 L50 44 L70 32 L70 12 Z" fill="#4B6A9B" />
          {/* Ventana 2x2 */}
          <rect x="36" y="18" width="5" height="5" fill="#2D4A6E" transform="skewY(-30) translate(0, 12)" opacity="0.6"/>
          <rect x="43" y="18" width="5" height="5" fill="#2D4A6E" transform="skewY(-30) translate(0, 12)" opacity="0.6"/>
          <rect x="36" y="25" width="5" height="5" fill="#2D4A6E" transform="skewY(-30) translate(0, 12)" opacity="0.6"/>
          <rect x="43" y="25" width="5" height="5" fill="#2D4A6E" transform="skewY(-30) translate(0, 12)" opacity="0.6"/>
        </g>

        {/* Cubo izquierdo medio (C) */}
        <g>
          <path d="M30 32 L50 44 L30 56 L10 44 Z" fill="#6A9BC5" />
          <path d="M10 44 L10 74 L30 86 L30 56 Z" fill="#3D5A80" />
          <path d="M30 56 L30 86 L50 74 L50 44 Z" fill="#4B6A9B" />
          {/* Letra C */}
          <text x="26" y="70" fill="#1E3A5F" fontSize="18" fontWeight="bold" fontFamily="Arial, sans-serif" textAnchor="middle">C</text>
        </g>

        {/* Cubo derecho medio (B) */}
        <g>
          <path d="M50 44 L70 56 L50 68 L30 56 Z" fill="#6A9BC5" />
          <path d="M30 56 L30 86 L50 98 L50 68 Z" fill="#3D5A80" />
          <path d="M50 68 L50 98 L70 86 L70 56 Z" fill="#4B6A9B" />
          {/* Letra B */}
          <text x="46" y="83" fill="#1E3A5F" fontSize="18" fontWeight="bold" fontFamily="Arial, sans-serif" textAnchor="middle">B</text>
        </g>

        {/* Cubo inferior derecho (G) */}
        <g>
          <path d="M70 56 L90 68 L70 80 L50 68 Z" fill="#6A9BC5" />
          <path d="M50 68 L50 98 L70 110 L70 80 Z" fill="#3D5A80" />
          <path d="M70 80 L70 110 L90 98 L90 68 Z" fill="#4B6A9B" />
          {/* Letra G */}
          <text x="68" y="95" fill="#1E3A5F" fontSize="16" fontWeight="bold" fontFamily="Arial, sans-serif" textAnchor="middle">G</text>
        </g>
      </svg>
      {showText && (
        <span className="text-white font-bold text-lg tracking-wide mt-2">CBGest</span>
      )}
    </div>
  );
};

/**
 * Logo simplificado para usar en espacios pequeños (como sidebar/header)
 */
export const LogoMini: React.FC<{ size?: number; className?: string }> = ({
  size = 32,
  className = ''
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Cubo isométrico simplificado */}
      <path d="M20 2 L36 11 L20 20 L4 11 Z" fill="#6A9BC5" />
      <path d="M4 11 L4 29 L20 38 L20 20 Z" fill="#3D5A80" />
      <path d="M20 20 L20 38 L36 29 L36 11 Z" fill="#4B6A9B" />

      {/* Líneas internas para dar efecto de cubos */}
      <path d="M12 15 L12 24 L20 29" stroke="#2D4A6E" strokeWidth="1" fill="none" opacity="0.5"/>
      <path d="M28 15 L28 24 L20 29" stroke="#2D4A6E" strokeWidth="1" fill="none" opacity="0.5"/>
      <path d="M12 15 L20 20 L28 15" stroke="#2D4A6E" strokeWidth="1" fill="none" opacity="0.5"/>
    </svg>
  );
};

/**
 * Logo con los cubos 3D isométricos - versión SVG inline
 */
export const LogoCubes: React.FC<{ size?: number; className?: string }> = ({
  size = 48,
  className = ''
}) => {
  const scale = size / 80;

  return (
    <svg
      width={80 * scale}
      height={96 * scale}
      viewBox="0 0 80 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Cubo superior (ventana) */}
      <path d="M40 0 L56 9 L40 18 L24 9 Z" fill="#5A7FAE" />
      <path d="M24 9 L24 27 L40 36 L40 18 Z" fill="#3A5578" />
      <path d="M40 18 L40 36 L56 27 L56 9 Z" fill="#4A6B93" />
      {/* Ventanas */}
      <circle cx="32" cy="20" r="2" fill="#2A4562" opacity="0.7"/>
      <circle cx="38" cy="17" r="2" fill="#2A4562" opacity="0.7"/>
      <circle cx="32" cy="26" r="2" fill="#2A4562" opacity="0.7"/>
      <circle cx="38" cy="23" r="2" fill="#2A4562" opacity="0.7"/>

      {/* Cubo C (izquierda medio) */}
      <path d="M24 27 L40 36 L24 45 L8 36 Z" fill="#5A7FAE" />
      <path d="M8 36 L8 54 L24 63 L24 45 Z" fill="#3A5578" />
      <path d="M24 45 L24 63 L40 54 L40 36 Z" fill="#4A6B93" />

      {/* Cubo B (centro) - más grande */}
      <path d="M40 36 L56 45 L40 54 L24 45 Z" fill="#5A7FAE" />
      <path d="M24 45 L24 72 L40 81 L40 54 Z" fill="#3A5578" />
      <path d="M40 54 L40 81 L56 72 L56 45 Z" fill="#4A6B93" />

      {/* Cubo G (derecha) */}
      <path d="M56 54 L72 63 L56 72 L40 63 Z" fill="#5A7FAE" />
      <path d="M40 63 L40 81 L56 90 L56 72 Z" fill="#3A5578" />
      <path d="M56 72 L56 90 L72 81 L72 63 Z" fill="#4A6B93" />

      {/* Letras recortadas/huecas */}
      <text x="15" y="52" fill="#1E3A5F" fontSize="11" fontWeight="bold" fontFamily="Arial">C</text>
      <text x="32" y="68" fill="#1E3A5F" fontSize="12" fontWeight="bold" fontFamily="Arial">B</text>
      <text x="52" y="82" fill="#1E3A5F" fontSize="10" fontWeight="bold" fontFamily="Arial">G</text>
    </svg>
  );
};

export default Logo;
