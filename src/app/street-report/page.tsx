import type { Metadata } from "next";
import StreetReportApp from "@/components/street-brain/StreetReportApp";
import "./street-brain.css";
export const metadata: Metadata = {title:"Street reports · One Hackney"};
export default function Page(){return <div className="street-brain"><StreetReportApp/></div>;}
