import React from 'react';

const Features: React.FC = () => {
  return (
    <section className="py-20">
      <div className="container mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">Our Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <h3 className="text-xl font-semibold mb-2">Feature 1</h3>
            <p>Description of feature 1</p>
          </div>
          <div className="text-center">
            <h3 className="text-xl font-semibold mb-2">Feature 2</h3>
            <p>Description of feature 2</p>
          </div>
          <div className="text-center">
            <h3 className="text-xl font-semibold mb-2">Feature 3</h3>
            <p>Description of feature 3</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;