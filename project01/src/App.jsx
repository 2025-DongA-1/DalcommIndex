import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout"

import Main from "./pages/Main";
import MapPage from "./pages/Map";
import Chatbot from "./pages/Chat";
import Login from "./pages/Login";
import Join from "./pages/Join";
import Mypage from "./pages/Mypage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Main />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/chatbot" element={<Chatbot />} />
      <Route path="/login" element={<Login />} />
      <Route path="/join" element={<Join />} />
      <Route path="/mypage" element={<Mypage />} />
    </Routes>
  );
}