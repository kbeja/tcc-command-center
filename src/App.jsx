import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useWorkshopItems, useProducts } from './lib/hooks';
import Nav from './components/Nav';
import CaptureButton from './components/CaptureButton';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductWorkspace from './pages/ProductWorkspace';
import Sparks from './pages/Sparks';
import Research from './pages/Research';
import Workshop from './pages/Workshop';
import Analytics from './pages/Analytics';
import Portfolio from './pages/Portfolio';
import Trends from './pages/Trends';
import Collections from './pages/Collections';
import CollectionDetail from './pages/CollectionDetail';
import Knowledge from './pages/Knowledge';
import ListingBuilder from './pages/ListingBuilder';
import ConceptWorkspace from './pages/ConceptWorkspace';
import Concepts from './pages/Concepts';
import './styles/global.css';

function AppInner() {
  const { items } = useWorkshopItems();
  const { products } = useProducts();
  const liveProducts = products.filter(p => p.stage === 'Live' || p.stage === 'Reviewing');
  const moSales = liveProducts.reduce((s, p) => s + (p.mo_sales || 0), 0);
  const moRevenue = liveProducts.reduce((s, p) => s + (p.mo_revenue || 0), 0);
  return (
    <>
      <Nav workshopCount={items.length} moSales={moSales} moRevenue={moRevenue} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductWorkspace />} />
        <Route path="/sparks" element={<Sparks />} />
        <Route path="/research" element={<Research />} />
        <Route path="/workshop" element={<Workshop />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/collections/:name" element={<CollectionDetail />} />
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="/listing-builder" element={<ListingBuilder />} />
        <Route path="/concepts" element={<Concepts />} />
        <Route path="/concepts/:id" element={<ConceptWorkspace />} />
      </Routes>
      <CaptureButton />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
