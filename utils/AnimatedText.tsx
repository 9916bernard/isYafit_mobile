import React, { useEffect, useRef, useState } from 'react';
import { Text, View, Animated, LayoutChangeEvent } from 'react-native';

interface AnimatedTextProps {
  children: string;
  style?: any;
  direction?: 'horizontal' | 'vertical';
  speed?: number;
  pauseDuration?: number;
  maxWidth?: number;
  maxHeight?: number;
}

const AnimatedText: React.FC<AnimatedTextProps> = ({
  children,
  style,
  direction = 'horizontal',
  speed = 50,
  pauseDuration = 2000,
  maxWidth,
  maxHeight,
}) => {
  const [isTextTruncated, setIsTextTruncated] = useState(false);
  const [textWidth, setTextWidth] = useState(0);
  const [textHeight, setTextHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const translateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isTextTruncated) {
      const startAnimation = () => {
        const maxTranslate = direction === 'horizontal' 
          ? Math.max(0, textWidth - containerWidth)
          : Math.max(0, textHeight - containerHeight);
        
        if (maxTranslate <= 0) return;

        const animationDuration = (maxTranslate / speed) * 1000;
        
        Animated.sequence([
          Animated.delay(pauseDuration),
          Animated.timing(translateAnim, {
            toValue: maxTranslate,
            duration: animationDuration,
            useNativeDriver: true,
          }),
          Animated.delay(pauseDuration),
          Animated.timing(translateAnim, {
            toValue: 0,
            duration: animationDuration,
            useNativeDriver: true,
          }),
        ]).start(() => {
          startAnimation();
        });
      };

      startAnimation();
    } else {
      translateAnim.setValue(0);
    }

    return () => {
      translateAnim.stopAnimation();
    };
  }, [isTextTruncated, textWidth, textHeight, containerWidth, containerHeight, direction, speed, pauseDuration, translateAnim]);

  const onTextLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setTextWidth(width);
    setTextHeight(height);
  };

  const onContainerLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerWidth(width);
    setContainerHeight(height);
    
    const isTruncated = direction === 'horizontal' 
      ? width > 0 && textWidth > width
      : height > 0 && textHeight > height;
    
    setIsTextTruncated(isTruncated);
  };

  const animatedStyle = direction === 'horizontal' 
    ? {
        transform: [{ translateX: translateAnim }],
      }
    : {
        transform: [{ translateY: translateAnim }],
      };

  return (
    <View 
      style={[
        { 
          overflow: 'hidden',
          maxWidth: maxWidth || '100%',
          maxHeight: maxHeight,
        },
        style
      ]}
      onLayout={onContainerLayout}
    >
      <Animated.Text
        style={[animatedStyle]}
        onLayout={onTextLayout}
        numberOfLines={direction === 'vertical' ? undefined : 1}
      >
        {children}
      </Animated.Text>
    </View>
  );
};

export default AnimatedText; 