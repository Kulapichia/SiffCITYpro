// src/components/CelebritiesSection.tsx (新建)
import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Celebrity } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';
import { useIsTablet } from '@/lib/useIsTablet';
import ConfirmationDialog from './ConfirmationDialog';
import CelebritiesSectionSkeleton from './CelebritiesSectionSkeleton'; // Import skeleton

interface CelebritiesSectionProps {
  celebrities: Celebrity[];
}

const CelebritiesSection: React.FC<CelebritiesSectionProps> = ({ celebrities }) => {
  const router = useRouter();
  const isTablet = useIsTablet();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState('');

  // Determine the card width based on device type.
  // If isTablet is null, use the default non-tablet width for initial render of skeleton.
  const cardWidth = isTablet === null ? 'w-32 sm:w-44' : (isTablet ? 'w-40' : 'w-32 sm:w-44');

  // If no celebrities, and device type is known, return null.
  // If no celebrities, but device type is unknown, show skeleton with default width.
  if (!celebrities || celebrities.length === 0) {
    return <CelebritiesSectionSkeleton cardWidth={cardWidth} />;
  }

  // If celebrities exist, but device type is unknown, show skeleton with default width.
  if (isTablet === null) {
    return <CelebritiesSectionSkeleton cardWidth={cardWidth} />;
  }

  const handleCelebrityClick = (person: Celebrity) => {
    if (person.actorurl) {
      setSelectedUrl(person.actorurl);
      setIsDialogOpen(true);
    }
    // If no actorurl, do nothing
  };

  const handleConfirm = () => {
    if (selectedUrl) {
      try {
        console.log('Attempting to open URL:', selectedUrl);
        window.open(selectedUrl, '_blank', 'noopener,noreferrer');
      } catch (error) {
        console.error('Failed to open URL:', selectedUrl, error);
        // Optionally, show a user-friendly error message here
      }
    }
    setIsDialogOpen(false);
  };

  return (
    <>
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">演职人员</h2>
        <div className="flex overflow-x-auto space-x-4 pb-4 hide-scrollbar">
          {celebrities.map((person, index) => {
            const isClickable = !!person.actorurl;
            const cardClassName = `group relative flex-none ${cardWidth} flex flex-col items-center text-center transition-all duration-300 ease-in-out hover:scale-[1.05] hover:z-10 ${
              isClickable ? 'cursor-pointer' : 'cursor-default'
            }`;

            return (
              <div
                key={index}
                className={cardClassName}
                onClick={() => handleCelebrityClick(person)}
              >
                <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden mb-2">
                  <Image
                    src={processImageUrl(person.actorposter)}
                    alt={person.actorname}
                    fill
                    className="object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 ease-in-out group-hover:opacity-100" />
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate w-full px-1 transition-colors duration-300 ease-in-out group-hover:text-black dark:group-hover:text-white">
                  {person.actorname}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 truncate w-full px-1">
                  {person.role}
                </p>
              </div>
            );
          })}
        </div>
      </div>
      <ConfirmationDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onConfirm={handleConfirm}
        title="提示"
        message="是否跳转到豆瓣查看演员详细信息？"
      />
    </>
  );
};

export default CelebritiesSection;
