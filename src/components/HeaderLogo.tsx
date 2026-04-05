import { useNavigate } from "react-router-dom";
import terrevoltLogo from "@/assets/terrevolt-logo.svg";

export function HeaderLogo() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate("/")}
      className="h-8 flex items-center focus:outline-none"
      aria-label="Home"
    >
      <img src={terrevoltLogo} alt="TerreVolt" className="h-7" />
    </button>
  );
}
