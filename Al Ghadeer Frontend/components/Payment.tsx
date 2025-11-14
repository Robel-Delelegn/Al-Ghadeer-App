import {View, Text} from "react-native";
import CustomButton from "@/components/CustomButton";


const Payment = () => {
    const openPaymentSheet = () => {
    }
    return (
        <>
            <CustomButton title="Confirm Ride" onPress={openPaymentSheet} className="my-10"/>
        </>
    )
}
export default Payment