import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Hero from "../components/sections/Hero";
import TrustSection from "../components/sections/TrustSection";
import Features from "../components/sections/Features";
import ProductShowcase from "../components/sections/ProductShowcase";
import HowItWorks from "../components/sections/HowItWorks";
import BusinessBenefits from "../components/sections/BusinessBenefits";
import WorkflowTimeline from "../components/sections/WorkflowTimeline";
import Testimonials from "../components/sections/Testimonials";
import BusinessAccess from "../components/sections/BusinessAccess";
import FAQ from "../components/sections/FAQ";
import FinalCTA from "../components/sections/FinalCTA";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main>
        <Hero />
        <TrustSection />
        <Features />
        <ProductShowcase />
        <HowItWorks />
        <BusinessBenefits />
        <WorkflowTimeline />
        <Testimonials />
        <BusinessAccess />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
