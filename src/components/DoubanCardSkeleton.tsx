import { ImagePlaceholder } from '@/components/ImagePlaceholder';

interface DoubanCardSkeletonProps {
  from?: 'movie' | 'tv' | 'variety' | 'anime' | 'other';
}

const DoubanCardSkeleton: React.FC<DoubanCardSkeletonProps> = ({ from = 'other' }) => {
  return (
    <div className='w-full'>
      <div className='group relative w-full rounded-lg bg-transparent shadow-none flex flex-col'>
        {/* 图片占位符 - 骨架屏效果 */}
        <ImagePlaceholder aspectRatio='aspect-[2/3]' />

        {/* 信息层骨架 */}
        <div className='absolute top-[calc(100%+0.5rem)] left-0 right-0'>
          <div className='flex flex-col items-center justify-center'>
            {/* 标题占位符 */}
            <div className='h-4 w-24 sm:w-32 bg-gray-300 dark:bg-gray-700 rounded animate-pulse'></div>
            {/* 年份占位符 - 仅在豆瓣和搜索页面显示 */}
            {(from === 'movie' || from === 'tv' || from === 'variety' || from === 'anime' || from === 'other') && (
              <div className='h-3 mt-1 bg-gray-300 dark:bg-gray-700 rounded w-12 animate-pulse'></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoubanCardSkeleton;

