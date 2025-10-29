// src/components/CelebritiesSectionSkeleton.tsx (新建)
import React from 'react';

interface CelebritiesSectionSkeletonProps {
  cardWidth: string;
}

const CelebritiesSectionSkeleton: React.FC<CelebritiesSectionSkeletonProps> = ({ cardWidth }) => {
  return (
    <div className="mt-8">
      <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded w-32 mb-4 animate-pulse"></div>
      <div className="flex overflow-x-auto space-x-4 pb-4 hide-scrollbar">
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={index} className={`group relative flex-none ${cardWidth} flex flex-col items-center text-center`}>
            <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden mb-2">
              <div className="w-full h-full bg-gray-300 dark:bg-gray-700 animate-pulse"></div>
            </div>
            <div className="w-full">
              <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4 mx-auto animate-pulse"></div>
              <div className="h-3 mt-1 bg-gray-300 dark:bg-gray-700 rounded w-1/2 mx-auto animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CelebritiesSectionSkeleton;
