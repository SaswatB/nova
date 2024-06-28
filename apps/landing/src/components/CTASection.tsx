import React from "react";
import { Helmet } from "react-helmet";

const CTASection: React.FC = () => {
  return (
    <section id="cta" className="py-20 bg-blue-600 text-white">
      <div className="container mx-auto text-center">
        <h2 className="text-4xl font-bold mb-4">Ready to Supercharge Your Development?</h2>

        <div className="flex justify-center w-fit mx-auto">
          <div id="getWaitlistContainer" className="w-auto" data-waitlist_id="18214" data-widget_type="WIDGET_1"></div>
        </div>
        <Helmet>
          <link
            rel="stylesheet"
            type="text/css"
            href="https://prod-waitlist-widget.s3.us-east-2.amazonaws.com/getwaitlist.min.css"
          />
          <script src="https://prod-waitlist-widget.s3.us-east-2.amazonaws.com/getwaitlist.min.js"></script>
        </Helmet>
      </div>
    </section>
  );
};

export default CTASection;
