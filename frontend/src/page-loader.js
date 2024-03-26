import React from "react";

export const PageLoader = () => {
  const loadingImg = "/images/loader.svg";

  return (
    <div className="w-10 h-10">
      <img src={loadingImg} alt="Loading..." />
    </div>
  );
};
