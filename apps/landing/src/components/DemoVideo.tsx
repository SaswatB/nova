import React from "react";

const DemoVideo: React.FC = () => {
  return (
    <section className="py-20 bg-gray-100 dark:bg-gray-800">
      <div className="container mx-auto">
        <h2 className="text-4xl font-bold text-center mb-12 text-gradient">See Nova in Action</h2>
        <div className="aspect-w-16 aspect-h-9 max-w-4xl mx-auto">
          {/* Replace with actual video embed */}
          <div className="relative w-full h-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
            <div style={{ paddingBottom: "64.63195691202873%", height: 0 }}>
              <iframe
                src="https://www.loom.com/embed/fc94e215a2154a718a64d429c3873d18?sid=f3f6a791-7ca2-4a14-84b3-ad3097cea5ba"
                frameBorder="0"
                allowFullScreen
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
              ></iframe>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DemoVideo;
