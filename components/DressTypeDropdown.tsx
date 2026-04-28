import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface DressTypeOption {
  value: string;
  label: string;
  subTypes?: string[];
}

interface DressTypeDropdownProps {
  value: string;
  onChange: (value: string) => void;
  dressTypes: string[];
  required?: boolean;
}

// Map of dress types to their variants/sub-types for hover preview
const DRESS_TYPE_VARIANTS: Record<string, string[]> = {
  'Shirt': ['Full Sleeve', 'Half Sleeve'],
  'School Shirt': ['Full Sleeve', 'Half Sleeve'],
  'Trouser': ['Official', 'Denim', 'Cut Model'],
  'School Trouser': ['Standard', 'Slim Fit'],
  'Thobe': ['Standard'],
  'Thobe with pajama': ['Standard'],
  'Jubba with pajama': ['Standard'],
  'Kurta': ['Short', 'Long'],
  'Elastic Trouser': ['Standard', 'Slim'],
  'Elastic Shorts': ['Standard', 'Sports'],
  'Band Shorts': ['Standard'],
  'Bow': ['Standard'],
  'Jubba': ['Standard'],
  'Coat': ['Single Breasted', 'Double Breasted'],
  'Waist Coat': ['Standard']
};

const DressTypeDropdown: React.FC<DressTypeDropdownProps> = ({
  value,
  onChange,
  dressTypes,
  required = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredType, setHoveredType] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full border border-gray-300 rounded-md py-1.5 px-3 text-sm focus:ring-primary-500 focus:border-primary-500 flex items-center justify-between bg-white hover:bg-gray-50 transition-colors ${
          !value ? 'text-gray-500' : 'text-gray-900'
        }`}
      >
        <span>{value || 'Select Type'}</span>
        <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
          <div className="max-h-64 overflow-y-auto">
            {dressTypes.map(type => (
              <div
                key={type}
                className="relative"
                onMouseEnter={() => setHoveredType(type)}
                onMouseLeave={() => setHoveredType(null)}
              >
                <button
                  type="button"
                  onClick={() => {
                    onChange(type);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    value === type
                      ? 'bg-primary-100 text-primary-900 font-semibold'
                      : 'hover:bg-gray-100 text-gray-900'
                  }`}
                >
                  {type}
                </button>

                {/* Hover Preview Tooltip */}
                {hoveredType === type && DRESS_TYPE_VARIANTS[type] && (
                  <div className="absolute left-full ml-2 top-0 bg-white border border-gray-300 rounded-md shadow-lg p-2 min-w-max z-20 whitespace-nowrap">
                    <div className="text-xs font-bold text-gray-700 mb-1 px-1">
                      Available styles:
                    </div>
                    <ul className="text-xs text-gray-600">
                      {DRESS_TYPE_VARIANTS[type]?.map(variant => (
                        <li key={variant} className="px-1 py-0.5 hover:bg-gray-100 rounded cursor-pointer">
                          • {variant}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DressTypeDropdown;
