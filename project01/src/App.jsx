import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout"

import Main from "./pages/Main";
import Search from "./pages/Search"
import MapPage from "./pages/Map";
import Chatbot from "./pages/Chat";
import Login from "./pages/Login";
import Join from "./pages/Join";
import Mypage from "./pages/Mypage";
import RankingPage from "./pages/RankingPage"
import CafeDetail from "./pages/CafeDetail";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Main />} />
      <Route path="/search" element={<Search />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/chatbot" element={<Chatbot />} />
      <Route path="/login" element={<Login />} />
      <Route path="/join" element={<Join />} />
      <Route path="/mypage" element={<Mypage />} />
      <Route path="/rankingpage" element={<RankingPage />} />
      
      <Route path="/cafe/:id" element={<CafeDetail />} />
      <Route path="/cafe" element={<CafeDetail />} />
    </Routes>
  );
}