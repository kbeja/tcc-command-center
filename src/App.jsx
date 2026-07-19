import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useWorkshopItems } from './lib/hooks';
import Nav from './components/Nav';
import CaptureButton from './components/CaptureButton';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductWorkspace from './pages/ProductWorkspace';
import Sparks from './pages/Sparks';
import Research from './pages/Research';
import Workshop from './pages/Workshop';
import Analytics from './pages/Analytics';
import Trends from './pages/Trends';
import Collections from './pages/Collections';
import CollectionDetail from './pages/CollectionDetail';
import Knowledge from './pages/Knowledge';
import ListingBuilder from './pages/ListingBuilder';
import './styles/global.css';

function AppInner() {
  const { items } = useWorkshopItems();
  return (
    <>
      <Nav workshopCount={items.length} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductWorkspace />} />
        <Route path="/sparks" element={<Sparks />} />
        <Route path="/research" element={<Research />} />
        <Route path="/workshop" element={<Workshop />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/collections/:name" element={<CollectionDetail />} />
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="/listing-builder" element={<ListingBuilder />} />
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
