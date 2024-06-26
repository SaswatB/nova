import React from 'react';

const DemoVideo: React.FC = () => {
  return (
    <section className="py-20 bg-gray-100 dark:bg-gray-800">
      <div className="container mx-auto">
        <h2 className="text-4xl font-bold text-center mb-12 text-gradient">See Nova in Action</h2>
        <div className="aspect-w-16 aspect-h-9 max-w-4xl mx-auto">
          {/* Replace with actual video embed */}
          <div className="w-full h-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-2xl text-gray-600 dark:text-gray-400">Video Placeholder</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DemoVideo;