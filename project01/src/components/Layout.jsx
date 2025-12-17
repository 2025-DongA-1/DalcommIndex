import React from "react";
import Header from "./Header";

const Layout = ({ children, showInfoBar = false }) => {
  return (
    <div className="page">
      <Header showInfoBar={showInfoBar} />
      <main className="container">{children}</main>
    </div>
  );
};

export default Layout;
