import React from 'react';
import { ImagePlaceholder } from './ImagePlaceholder';

interface HomeVideoCardsSkeletonSectionProps {
  cardWidth: string;
  sectionType: 'movie' | 'tv' | 'variety' | 'anime' | 'other';
}

const HomeVideoCardsSkeletonSection: React.FC<HomeVideoCardsSkeletonSectionProps> = ({ cardWidth, sectionType }) => {
  // This skeleton now mirrors the layout and responsive sizing of the actual RecommendationSection component.
  // It uses a flexbox for horizontal scrolling and applies the same width classes to the cards.
  return (
    <div className="mt-8">
      <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded w-1/3 mb-4 animate-pulse"></div>
      <div className="flex overflow-x-auto space-x-4 pb-4 hide-scrollbar">
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={index} className={`flex-none ${cardWidth}`}>
            <div className="group relative rounded-lg bg-transparent cursor-pointer transition-all duration-300 ease-in-out hover:scale-[1.05] hover:z-[500]">
              <div className="relative aspect-[2/3] overflow-hidden rounded-lg">
                <ImagePlaceholder aspectRatio="aspect-[2/3]" />
              </div>
              <div className="mt-2 text-center">
                <div className="block text-sm font-semibold truncate">
                  <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4 mx-auto animate-pulse"></div>
                  {(sectionType === 'movie' || sectionType === 'tv' || sectionType === 'variety' || sectionType === 'anime') && (
                    <div className="h-3 mt-1 bg-gray-300 dark:bg-gray-700 rounded w-1/2 mx-auto animate-pulse"></div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HomeVideoCardsSkeletonSection;
