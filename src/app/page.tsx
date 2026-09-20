import RoomCanvasLoader from "@/room/RoomCanvasLoader";

export default function Home() {
  return (
    <div className="h-full w-full flex-1">
      <RoomCanvasLoader celebrantName="Alex" age={25} bannerText="HAPPY BIRTHDAY!" />
    </div>
  );
}
