import React from 'react';

interface VideoCardSkeletonProps {
  className?: string;
  showYear?: boolean;
}

const VideoCardSkeleton: React.FC<VideoCardSkeletonProps> = ({ className = 'min-w-[96px] w-24 sm:min-w-[180px] sm:w-44', showYear = false }) => {
  return (
    <div className={className}>
      <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
        <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
      </div>
      <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
      {showYear && (
        <div className='mt-1 h-3 bg-gray-200 rounded animate-pulse dark:bg-gray-800 w-1/2 mx-auto'></div>
      )}
    </div>
  );
};

export default VideoCardSkeleton;
