import React from 'react';

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className='fixed inset-0 w-screen h-screen flex items-center justify-center px-4 overflow-hidden bg-cover bg-center bg-fixed bg-black animate-fadeIn overscroll-y-contain'
      style={{ backgroundImage: 'url(/loginimg.jpg)' }}
    >
      <div className='absolute inset-0 bg-black opacity-50'></div> {/* Black overlay */}
      {children}
    </div>
  );
}
